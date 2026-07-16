package sshx

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/salawat/sshmgr/internal/domain"
)

func khPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), ".ssh", "known_hosts")
}

// A host absent from known_hosts is a TOFU prompt; accepting writes it, and
// a second verify of the same key then passes with no prompt.
func TestUnknownHostPromptsThenPersists(t *testing.T) {
	path := khPath(t)
	p := &stubPrompter{accept: true}
	v, err := NewVerifier(path, p)
	if err != nil {
		t.Fatal(err)
	}
	_, hostKey := newTestServer(t) // only need the key + a stand-in addr
	remote := mustResolve(t, "10.0.1.20:22")

	if err := v.Callback()("10.0.1.20:22", remote, hostKey); err != nil {
		t.Fatalf("first verify (accept) errored: %v", err)
	}
	if len(p.seen) != 1 || p.seen[0].IsChanged {
		t.Fatalf("expected one unknown-host prompt, got %+v", p.seen)
	}
	if !strings.HasPrefix(p.seen[0].Fingerprint, "SHA256:") {
		t.Fatalf("fingerprint not SHA256: %q", p.seen[0].Fingerprint)
	}
	// Re-open (fresh matcher reads the just-written file); no prompt now.
	p2 := &stubPrompter{accept: false}
	v2, _ := NewVerifier(path, p2)
	if err := v2.Callback()("10.0.1.20:22", remote, hostKey); err != nil {
		t.Fatalf("known host should verify silently: %v", err)
	}
	if len(p2.seen) != 0 {
		t.Fatalf("a known host should not prompt")
	}
}

// Rejecting a TOFU prompt returns ERR_HOSTKEY_REJECTED and writes nothing.
func TestUnknownHostRejectedReturnsCode(t *testing.T) {
	path := khPath(t)
	p := &stubPrompter{accept: false}
	v, _ := NewVerifier(path, p)
	_, hostKey := newTestServer(t)
	err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), hostKey)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeHostKeyRejected {
		t.Fatalf("want ERR_HOSTKEY_REJECTED, got %v", err)
	}
}

// A host stored with a DIFFERENT key triggers the changed path: the prompt
// is flagged IsChanged with the OLD fingerprint, default is not to write.
func TestChangedKeyPromptsWithOldFingerprint(t *testing.T) {
	path := khPath(t)
	_, oldKey := newTestServer(t)
	_, newKey := newTestServer(t) // a different generated key
	seedKnownHost(t, path, "10.0.1.20:22", oldKey)

	p := &stubPrompter{accept: false}
	v, _ := NewVerifier(path, p)
	err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey)
	if len(p.seen) != 1 || !p.seen[0].IsChanged {
		t.Fatalf("expected a changed-key prompt, got %+v", p.seen)
	}
	if p.seen[0].OldFingerprint != ssh.FingerprintSHA256(oldKey) {
		t.Fatalf("old fingerprint = %q", p.seen[0].OldFingerprint)
	}
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeHostKeyRejected {
		t.Fatalf("declined change should be ERR_HOSTKEY_REJECTED, got %v", err)
	}
}

// Accepting a changed key drops the old line and stores the new one, so the
// old key no longer verifies and the new key does.
func TestAcceptedChangedKeyReplacesOldEntry(t *testing.T) {
	path := khPath(t)
	_, oldKey := newTestServer(t)
	_, newKey := newTestServer(t)
	seedKnownHost(t, path, "10.0.1.20:22", oldKey)

	v, _ := NewVerifier(path, &stubPrompter{accept: true})
	if err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey); err != nil {
		t.Fatalf("accept changed: %v", err)
	}
	// Old key must now be rejected as CHANGED (not silently accepted).
	v2, _ := NewVerifier(path, &stubPrompter{accept: false})
	if err := v2.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), oldKey); err == nil {
		t.Fatal("old key still verifies after replacement")
	}
	// New key verifies silently.
	v3, _ := NewVerifier(path, &stubPrompter{accept: false})
	if err := v3.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey); err != nil {
		t.Fatalf("new key should verify: %v", err)
	}
}

// A @revoked line is a hard stop, distinct from a changed key, and is never
// overridable by the prompter.
func TestRevokedKeyIsHardStop(t *testing.T) {
	path := khPath(t)
	_, key := newTestServer(t)
	seedRevoked(t, path, "10.0.1.20:22", key)
	p := &stubPrompter{accept: true} // even "accept" must not save it
	v, _ := NewVerifier(path, p)
	err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), key)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeHostKeyRevoked {
		t.Fatalf("want ERR_HOSTKEY_REVOKED, got %v", err)
	}
	if len(p.seen) != 0 {
		t.Fatal("a revoked key must not reach the prompter")
	}
}

// One malformed line must not brick verification for good lines.
func TestMalformedLineDoesNotBrickTheFile(t *testing.T) {
	path := khPath(t)
	_, key := newTestServer(t)
	seedKnownHost(t, path, "good.example:22", key)
	// Corrupt the file with a garbage line.
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	_, _ = f.WriteString("this is not a valid known_hosts line\n")
	_ = f.Close()

	v, err := NewVerifier(path, &stubPrompter{accept: false})
	if err != nil {
		t.Fatalf("NewVerifier must tolerate a bad line, got %v", err)
	}
	if err := v.Callback()("good.example:22", mustResolve(t, "good.example:22"), key); err != nil {
		t.Fatalf("good host should still verify despite a bad line: %v", err)
	}
}

// Appending to a file without a trailing newline must not corrupt it.
func TestAppendRepairsMissingTrailingNewline(t *testing.T) {
	path := khPath(t)
	_, k1 := newTestServer(t)
	_, k2 := newTestServer(t)
	seedKnownHost(t, path, "a.example:22", k1)
	// Strip the trailing newline.
	b, _ := os.ReadFile(path)
	_ = os.WriteFile(path, []byte(strings.TrimRight(string(b), "\n")), 0o600)

	v, _ := NewVerifier(path, &stubPrompter{accept: true})
	if err := v.Callback()("b.example:22", mustResolve(t, "b.example:22"), k2); err != nil {
		t.Fatal(err)
	}
	// Both hosts must parse afterward.
	if _, err := knownhosts.New(path); err != nil {
		t.Fatalf("file corrupted by append: %v", err)
	}
}

// --- Additional tests beyond the brief's baseline, for coverage of error
// paths and multi-entry replace ---

// badAddr's String() is not a valid "host:port", which makes the
// underlying x/crypto check() return a plain wrapped error rather than a
// *KeyError or *RevokedError. Callback must surface that as-is instead of
// swallowing or miscoding it.
type badAddr struct{}

func (badAddr) Network() string { return "tcp" }
func (badAddr) String() string  { return "not-a-valid-address" }

func TestUnknownVerdictErrorSurfacesAsIs(t *testing.T) {
	path := khPath(t)
	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	_, hostKey := newTestServer(t)
	err = v.Callback()("10.0.1.20:22", badAddr{}, hostKey)
	if err == nil {
		t.Fatal("expected an error for a malformed remote address")
	}
	var de *domain.Error
	if errors.As(err, &de) {
		t.Fatalf("expected a raw passthrough error, got a coded domain error: %v", de)
	}
}

// A prompter error (e.g. a UI timeout) must propagate unchanged, not get
// coerced into ERR_HOSTKEY_REJECTED.
func TestPrompterErrorPropagates(t *testing.T) {
	path := khPath(t)
	promptErr := errors.New("prompt timed out")
	p := &stubPrompter{err: promptErr}
	v, _ := NewVerifier(path, p)
	_, hostKey := newTestServer(t)
	err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), hostKey)
	if !errors.Is(err, promptErr) {
		t.Fatalf("want the prompter's own error propagated, got %v", err)
	}
}

// NewVerifier must surface a clear error when it cannot even create the
// known_hosts directory (a path component collides with a plain file).
func TestNewVerifierMkdirAllFailure(t *testing.T) {
	base := t.TempDir()
	blocker := filepath.Join(base, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(blocker, "sub", "known_hosts")
	if _, err := NewVerifier(path, &stubPrompter{}); err == nil {
		t.Fatal("expected an error when the known_hosts directory cannot be created")
	}
}

// NewVerifier must surface a clear error when the directory exists but
// disallows creating the known_hosts file inside it.
func TestNewVerifierCreateFileFailure(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".ssh")
	if err := os.MkdirAll(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) })
	path := filepath.Join(dir, "known_hosts")
	if _, err := NewVerifier(path, &stubPrompter{}); err == nil {
		t.Fatal("expected an error when known_hosts cannot be created")
	}
}

// An unwritable known_hosts must fail the TOFU write with a coded error,
// not a bare I/O error and not a silent success.
func TestAppendOpenFailureReturnsCodedError(t *testing.T) {
	path := khPath(t)
	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o400); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, 0o600) })
	_, hostKey := newTestServer(t)
	err = v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), hostKey)
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want a coded domain error from an unwritable known_hosts, got %v", err)
	}
}

// replace must surface a coded error if it cannot even read the file to
// find the old line(s) to drop.
func TestReplaceReadFailureReturnsCodedError(t *testing.T) {
	path := khPath(t)
	_, oldKey := newTestServer(t)
	_, newKey := newTestServer(t)
	seedKnownHost(t, path, "10.0.1.20:22", oldKey)

	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o200); err != nil { // write-only: read must fail
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, 0o600) })

	err = v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey)
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want a coded domain error, got %v", err)
	}
}

// replace's atomic rewrite needs to create a temp file alongside
// known_hosts; if the directory forbids that, it must surface a coded
// error rather than silently drop the request or panic.
func TestReplaceTempFileCreationFailureReturnsCodedError(t *testing.T) {
	path := khPath(t)
	_, oldKey := newTestServer(t)
	_, newKey := newTestServer(t)
	seedKnownHost(t, path, "10.0.1.20:22", oldKey)

	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Dir(path)
	if err := os.Chmod(dir, 0o500); err != nil { // no write: CreateTemp fails
		t.Fatal(err)
	}
	// Restore before t.TempDir()'s own cleanup tries to remove the tree.
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) })

	err = v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey)
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want a coded domain error, got %v", err)
	}
}

// A host with more than one stored key (e.g. added redundantly over time)
// must have every stale line dropped on replace, not just the first.
func TestReplaceMultipleOldLinesAllDropped(t *testing.T) {
	path := khPath(t)
	_, oldKey1 := newTestServer(t)
	_, oldKey2 := newTestServer(t)
	_, newKey := newTestServer(t)
	seedKnownHost(t, path, "10.0.1.20:22", oldKey1)
	seedKnownHost(t, path, "10.0.1.20:22", oldKey2)

	p := &stubPrompter{accept: true}
	v, err := NewVerifier(path, p)
	if err != nil {
		t.Fatal(err)
	}
	if err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey); err != nil {
		t.Fatalf("accept changed: %v", err)
	}
	if len(p.seen) != 1 || !p.seen[0].IsChanged {
		t.Fatalf("expected one changed-key prompt, got %+v", p.seen)
	}

	for _, old := range []ssh.PublicKey{oldKey1, oldKey2} {
		v2, _ := NewVerifier(path, &stubPrompter{accept: false})
		if err := v2.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), old); err == nil {
			t.Fatal("a replaced old key still verifies")
		}
	}
	v3, _ := NewVerifier(path, &stubPrompter{accept: false})
	if err := v3.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey); err != nil {
		t.Fatalf("new key should verify: %v", err)
	}
}

// sanitizeKnownHosts must keep comments and blank lines verbatim, drop only
// the truly unparseable line, and count exactly what it dropped.
func TestSanitizeKnownHostsPreservesCommentsAndBlanks(t *testing.T) {
	path := khPath(t)
	_, key := newTestServer(t)
	seedKnownHost(t, path, "good.example:22", key)
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	augmented := "# a comment\n\n" + string(content) + "not a valid known_hosts line at all\n"
	if err := os.WriteFile(path, []byte(augmented), 0o600); err != nil {
		t.Fatal(err)
	}

	good, skipped := sanitizeKnownHosts(path)
	if skipped != 1 {
		t.Fatalf("skipped = %d, want 1", skipped)
	}
	if !strings.HasPrefix(good, "# a comment\n\n") {
		t.Fatalf("comment/blank not preserved verbatim at head: %q", good)
	}
	if strings.Contains(good, "not a valid known_hosts line") {
		t.Fatal("malformed line leaked into the sanitized output")
	}
	tmp := filepath.Join(t.TempDir(), "sanitized")
	if err := os.WriteFile(tmp, []byte(good), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := knownhosts.New(tmp); err != nil {
		t.Fatalf("sanitized output does not parse: %v", err)
	}
}

// loadTolerant's sanitize-and-retry path needs to create its own temp
// files; if that fails too (e.g. a broken TMPDIR), NewVerifier must
// surface an error rather than panic or silently return an empty matcher.
// Redirecting TMPDIR also breaks lineParses's own per-line trial file
// underneath sanitizeKnownHosts, covering that failure branch too.
func TestLoadTolerantTempFileFailureReturnsError(t *testing.T) {
	path := khPath(t)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("this is not valid at all\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TMPDIR", filepath.Join(t.TempDir(), "does-not-exist"))

	if _, err := NewVerifier(path, &stubPrompter{}); err == nil {
		t.Fatal("expected an error when temp files cannot be created")
	}
}

// sanitizeKnownHosts must fail closed (no lines, none skipped) rather than
// panic when it cannot even open the file.
func TestSanitizeKnownHostsUnreadableFile(t *testing.T) {
	good, skipped := sanitizeKnownHosts(filepath.Join(t.TempDir(), "does-not-exist"))
	if good != "" || skipped != 0 {
		t.Fatalf("want empty/0 for a path that cannot be opened, got %q/%d", good, skipped)
	}
}

// WriteKnownHost itself rejects a hostname containing whitespace; append
// must turn that into a coded error rather than a bare skeema error.
func TestAppendWriteKnownHostFailsOnSpaceInHostname(t *testing.T) {
	path := khPath(t)
	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	_, key := newTestServer(t)
	err = v.Callback()("bad host:22", mustResolve(t, "10.0.1.20:22"), key)
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want a coded domain error, got %v", err)
	}
}

// repairTrailingNewline must report an error rather than panic if handed an
// already-closed file handle.
func TestRepairTrailingNewlineOnClosedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "kh")
	if err := os.WriteFile(path, []byte("no-newline"), 0o600); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(path, os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if err := repairTrailingNewline(f); err == nil {
		t.Fatal("want an error from an already-closed file handle")
	}
}

// repairTrailingNewline peeks the last byte through a second, path-based
// open (see its doc comment: the append fd is write-only). If the path no
// longer resolves — deleted out from under an fd that is otherwise still
// perfectly valid — that peek must surface an error, not panic.
func TestRepairTrailingNewlinePathRemovedButFDOpen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "kh")
	if err := os.WriteFile(path, []byte("no-newline"), 0o600); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(path, os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := repairTrailingNewline(f); err == nil {
		t.Fatal("want an error once the path no longer resolves")
	}
}

// firstErr must report whichever of its arguments is non-nil first, and nil
// when none are.
func TestFirstErr(t *testing.T) {
	e1 := errors.New("first")
	e2 := errors.New("second")
	if err := firstErr(nil, nil); err != nil {
		t.Fatalf("firstErr(nil, nil) = %v, want nil", err)
	}
	if err := firstErr(e1, nil); err != e1 {
		t.Fatalf("firstErr(e1, nil) = %v, want e1", err)
	}
	if err := firstErr(nil, e2); err != e2 {
		t.Fatalf("firstErr(nil, e2) = %v, want e2", err)
	}
	if err := firstErr(e1, e2); err != e1 {
		t.Fatalf("firstErr(e1, e2) = %v, want e1 (first wins)", err)
	}
}

// rewriteAtomic must fail (and clean up its own temp file) rather than
// leave a stray temp file behind, when the destination cannot be replaced
// — e.g. because it is currently a directory, which os.Rename refuses to
// replace with a plain file (confirmed empirically: EEXIST on macOS).
func TestRewriteAtomicFailsWhenDestinationIsADirectory(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "known_hosts")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := rewriteAtomic(target, "content"); err == nil {
		t.Fatal("want an error when the destination is a directory")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("want only the original directory left behind, got %v", entries)
	}
}

// Appending to a host whose file already properly ends in a newline must
// not add a spurious blank line — repairTrailingNewline's "nothing to do"
// path.
func TestAppendToFileAlreadyEndingInNewlineNeedsNoRepair(t *testing.T) {
	path := khPath(t)
	_, k1 := newTestServer(t)
	_, k2 := newTestServer(t)
	seedKnownHost(t, path, "a.example:22", k1) // ends in '\n' already

	v, _ := NewVerifier(path, &stubPrompter{accept: true})
	if err := v.Callback()("b.example:22", mustResolve(t, "b.example:22"), k2); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	nonEmpty := 0
	for _, line := range strings.Split(string(b), "\n") {
		if line != "" {
			nonEmpty++
		}
	}
	if nonEmpty != 2 {
		t.Fatalf("want exactly 2 known_hosts lines, got %d: %q", nonEmpty, string(b))
	}
}

// HostKeyAlgorithms pins the algorithm list for a known host and reports
// none for an unknown one, so the dialer can fall back to defaults.
func TestHostKeyAlgorithms(t *testing.T) {
	path := khPath(t)
	_, key := newTestServer(t)
	seedKnownHost(t, path, "10.0.1.20:22", key)
	v, err := NewVerifier(path, &stubPrompter{})
	if err != nil {
		t.Fatal(err)
	}
	if algos := v.HostKeyAlgorithms("10.0.1.20:22"); len(algos) == 0 {
		t.Fatal("want at least one algorithm for a known host")
	}
	if algos := v.HostKeyAlgorithms("unknown.example:22"); len(algos) != 0 {
		t.Fatalf("want no algorithms for an unknown host, got %v", algos)
	}
}

// replace's len(want)==0 guard is defensive: Callback only ever calls
// replace when req.IsChanged (== len(keyErr.Want) > 0), so the guard is
// unreachable through the public flow. Exercise it directly so the branch
// isn't dead weight, and confirm it behaves exactly like append.
func TestReplaceWithNoWantAppendsOnly(t *testing.T) {
	path := khPath(t)
	_, key := newTestServer(t)
	v, err := NewVerifier(path, &stubPrompter{})
	if err != nil {
		t.Fatal(err)
	}
	if err := v.replace("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), key, nil); err != nil {
		t.Fatalf("replace with no want entries: %v", err)
	}
	v2, _ := NewVerifier(path, &stubPrompter{accept: false})
	if err := v2.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), key); err != nil {
		t.Fatalf("key should have been appended: %v", err)
	}
}

// --- Fix round 1 regression tests ---
//
// Finding A: replace must drop the OLD key by CONTENT (host pattern + key
// bytes), not by the want[i].Filename/Line metadata the original code used.
// That metadata names an already-deleted temp file whenever
// loadTolerant's sanitize-fallback path built the callback (see hostkey.go's
// replace doc comment) — so the old, buggy Filename==v.path comparison
// matched nothing in that path, the stale line was never removed from the
// REAL file, and the old (possibly attacker) key went on verifying
// silently forever: a SEC-03 defeat. Finding B: sanitizeKnownHosts must not
// silently truncate on a bufio.Scanner error.

// Regression for Finding A. Seeds a good host entry PLUS a line x/crypto
// cannot parse (forcing loadTolerant's sanitize-fallback path), accepts a
// key change, then opens a FRESH Verifier on the same REAL file and
// confirms the old key is now REJECTED (not silently trusted) while the
// new key verifies with no prompt. This test fails against the pre-fix
// (Filename==v.path) replace and passes after the content-based fix — see
// the fix report for the before/after run.
func TestAcceptedChangedKeyReplacesOldEntryEvenViaSanitizeFallback(t *testing.T) {
	path := khPath(t)
	_, oldKey := newTestServer(t)
	_, newKey := newTestServer(t)
	seedKnownHost(t, path, "10.0.1.20:22", oldKey)
	// Force loadTolerant's sanitize-fallback path: one line x/crypto's
	// strict parser cannot parse fails the whole real file.
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString("this is not a valid known_hosts line\n"); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}

	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatalf("NewVerifier must tolerate the malformed line: %v", err)
	}
	if err := v.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey); err != nil {
		t.Fatalf("accept changed key (via sanitize fallback): %v", err)
	}

	// Fresh verifier over the REAL file: the old key must now be REJECTED,
	// not silently trusted.
	v2, _ := NewVerifier(path, &stubPrompter{accept: false})
	if err := v2.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), oldKey); err == nil {
		t.Fatal("SEC-03 defeat: old key still verifies silently after an accepted change, even via the sanitize-fallback path")
	}
	// New key verifies silently.
	v3, _ := NewVerifier(path, &stubPrompter{accept: false})
	if err := v3.Callback()("10.0.1.20:22", mustResolve(t, "10.0.1.20:22"), newKey); err != nil {
		t.Fatalf("new key should verify silently: %v", err)
	}
}

// shouldDropLine must positively identify only the stale plain host-key
// line for the host/key being replaced, and must never touch anything it
// cannot classify with confidence: a different host, a different key,
// blank/comment lines, an unparseable line, or a marker
// (@cert-authority/@revoked) line.
func TestShouldDropLine(t *testing.T) {
	_, key := newTestServer(t)
	_, otherKey := newTestServer(t)
	old := [][]byte{key.Marshal()}
	plainLine := knownhosts.Line([]string{"10.0.1.20:22"}, key)

	tests := []struct {
		name string
		line string
		host string
		old  [][]byte
		want bool
	}{
		{"matching host and key drops", plainLine, "10.0.1.20:22", old, true},
		{"different host keeps (same key, unrelated host)", plainLine, "10.0.1.21:22", old, false},
		{"different key keeps", knownhosts.Line([]string{"10.0.1.20:22"}, otherKey), "10.0.1.20:22", old, false},
		{"blank line keeps", "", "10.0.1.20:22", old, false},
		{"comment line keeps", "# a comment", "10.0.1.20:22", old, false},
		{"malformed line keeps", "not a valid known_hosts line", "10.0.1.20:22", old, false},
		{"revoked marker line keeps", "@revoked " + plainLine, "10.0.1.20:22", old, false},
		{"cert-authority marker line keeps", "@cert-authority " + plainLine, "10.0.1.20:22", old, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldDropLine(tc.line, tc.host, tc.old); got != tc.want {
				t.Fatalf("shouldDropLine(%q, %q) = %v, want %v", tc.line, tc.host, got, tc.want)
			}
		})
	}
}

// keyLineMatchesHost must handle plain, wildcard, negated, and salted-hash
// host patterns the same way golang.org/x/crypto/ssh/knownhosts's own
// (unexported) matcher does — see its doc comment for the "fails closed"
// design boundary this relies on.
func TestKeyLineMatchesHost(t *testing.T) {
	hashedPattern := knownhosts.HashHostname(knownhosts.Normalize("10.0.1.20:22"))

	tests := []struct {
		name     string
		patterns []string
		hostname string
		want     bool
	}{
		{"exact host match", []string{"10.0.1.20"}, "10.0.1.20:22", true},
		{"different host", []string{"10.0.1.21"}, "10.0.1.20:22", false},
		{"wildcard match", []string{"10.0.1.*"}, "10.0.1.20:22", true},
		{"wildcard no match", []string{"10.0.2.*"}, "10.0.1.20:22", false},
		{"negation excludes an otherwise-matching wildcard", []string{"10.0.1.*", "!10.0.1.20"}, "10.0.1.20:22", false},
		{"hashed host match", []string{hashedPattern}, "10.0.1.20:22", true},
		{"hashed host no match (different target)", []string{hashedPattern}, "10.0.1.99:22", false},
		{"empty pattern token ignored", []string{"", "10.0.1.20"}, "10.0.1.20:22", true},
		{"port mismatch", []string{"[10.0.1.20]:2222"}, "10.0.1.20:22", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := keyLineMatchesHost(tc.patterns, tc.hostname); got != tc.want {
				t.Fatalf("keyLineMatchesHost(%v, %q) = %v, want %v", tc.patterns, tc.hostname, got, tc.want)
			}
		})
	}
}

// hashedPatternMatches must reject every malformed hashed-pattern shape
// (wrong field count, wrong hash-type tag, undecodable salt/hash) rather
// than panicking or falsely matching, alongside the true-positive/negative
// cases.
func TestHashedPatternMatchesEdgeCases(t *testing.T) {
	valid := knownhosts.HashHostname(knownhosts.Normalize("10.0.1.20:22"))
	parts := strings.Split(valid, "|")
	saltB64, hashB64 := parts[2], parts[3]

	tests := []struct {
		name    string
		pattern string
		target  string
		want    bool
	}{
		{"valid match", valid, "10.0.1.20", true},
		{"wrong target", valid, "10.0.1.99", false},
		{"wrong part count", "|1|onlyonepart", "10.0.1.20", false},
		{"wrong hash-type tag", "|2|" + saltB64 + "|" + hashB64, "10.0.1.20", false},
		{"bad base64 salt", "|1|not-base64!!|" + hashB64, "10.0.1.20", false},
		{"bad base64 hash", "|1|" + saltB64 + "|not-base64!!", "10.0.1.20", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := hashedPatternMatches(tc.pattern, tc.target); got != tc.want {
				t.Fatalf("hashedPatternMatches(%q, %q) = %v, want %v", tc.pattern, tc.target, got, tc.want)
			}
		})
	}
}

// wildcardMatch must implement the sshd(8) known_hosts glob rules ('*' any
// run, '?' exactly one character), including backtracking for '*'.
func TestWildcardMatch(t *testing.T) {
	tests := []struct {
		pat, str string
		want     bool
	}{
		{"", "", true},
		{"", "x", false},
		// A bare "*" does NOT match an empty string: this port faithfully
		// mirrors x/crypto/ssh/knownhosts's own wildcardMatch, which checks
		// len(str)==0 before ever inspecting pat[0], so it returns false
		// here rather than treating "*" as "match anything including
		// nothing." Replicating that quirk exactly (rather than a more
		// "intuitive" glob) is the point: this matcher exists to agree with
		// x/crypto's own verification decisions, not to improve on them.
		{"*", "", false},
		{"*", "anything", true},
		{"10.0.1.*", "10.0.1.20", true},
		{"10.0.1.*", "10.0.2.20", false},
		{"10.0.1.2?", "10.0.1.20", true},
		{"10.0.1.2?", "10.0.1.200", false},
		{"a*b*c", "aXXbYYc", true},
		{"a*b*c", "aXXbYY", false},
		{"abc", "ab", false},
	}
	for _, tc := range tests {
		if got := wildcardMatch(tc.pat, tc.str); got != tc.want {
			t.Fatalf("wildcardMatch(%q, %q) = %v, want %v", tc.pat, tc.str, got, tc.want)
		}
	}
}

// splitHostPortDefault must default to port 22 exactly when net.SplitHostPort
// itself would fail (no explicit port), and otherwise defer to it.
func TestSplitHostPortDefault(t *testing.T) {
	tests := []struct {
		in                 string
		wantHost, wantPort string
	}{
		{"10.0.1.20:22", "10.0.1.20", "22"},
		{"10.0.1.20", "10.0.1.20", "22"},
		{"[::1]:2222", "::1", "2222"},
	}
	for _, tc := range tests {
		h, p := splitHostPortDefault(tc.in)
		if h != tc.wantHost || p != tc.wantPort {
			t.Fatalf("splitHostPortDefault(%q) = (%q, %q), want (%q, %q)", tc.in, h, p, tc.wantHost, tc.wantPort)
		}
	}
}

// Regression for Finding B. bufio.Scanner silently stops at its default
// 64KiB token cap (or a mid-file read error), dropping every subsequent
// line with no signal. After raising the buffer to 1MiB, force scanner.Err()
// anyway with a token that exceeds even that, and confirm the lines read
// before the failure point are kept (not discarded) rather than the whole
// result being silently truncated to nothing.
func TestSanitizeKnownHostsScanErrorKeepsLinesBeforeFailure(t *testing.T) {
	path := khPath(t)
	_, key := newTestServer(t)
	seedKnownHost(t, path, "good.example:22", key)
	// One grotesquely oversized "line" (no trailing newline) exceeding even
	// the raised 1MiB scanner buffer cap, forcing scanner.Err() to be
	// bufio.ErrTooLong once Scan reaches it.
	huge := strings.Repeat("a", 2*1024*1024)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(huge); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}

	good, _ := sanitizeKnownHosts(path)
	if !strings.Contains(good, "good.example") {
		t.Fatalf("the line read before the scan failure must be kept, not discarded (good has %d bytes)", len(good))
	}
	if strings.Contains(good, huge) {
		t.Fatal("the oversized token must not appear in the sanitized output")
	}
}
