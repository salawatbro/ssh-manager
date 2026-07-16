// Package sshx verifies SSH host keys against a known_hosts file, prompting
// through an injected callback for unknown or changed keys (TOFU). It knows
// nothing about the rest of the app beyond internal/domain's coded errors —
// the actual prompt UI is wired in by the service layer via HostKeyPrompter.
package sshx

import (
	"bufio"
	"bytes"
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // G505: SHA-1 here only reproduces OpenSSH's own HashKnownHosts salted-HMAC comparison to MATCH an existing hashed known_hosts line; it is not used for any new cryptographic guarantee.
	"encoding/base64"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/skeema/knownhosts"
	"golang.org/x/crypto/ssh"
	xknownhosts "golang.org/x/crypto/ssh/knownhosts"

	"github.com/salawat/sshmgr/internal/domain"
)

// HostKeyRequest describes a host key that needs a user verdict.
type HostKeyRequest struct {
	RequestID      string `json:"requestID"`
	Hostname       string `json:"hostname"`
	KeyType        string `json:"keyType"`
	Fingerprint    string `json:"fingerprint"`
	IsChanged      bool   `json:"isChanged"`
	IsRevoked      bool   `json:"isRevoked"`
	OldFingerprint string `json:"oldFingerprint"`
}

// HostKeyPrompter asks the user whether to trust an unknown or changed host
// key. It is implemented by the service layer, which turns Prompt into a
// frontend event and waits for the answer (Task 7).
type HostKeyPrompter interface {
	// Prompt blocks until the user answers or the prompt times out.
	Prompt(req HostKeyRequest) (accept bool, err error)
}

// Verifier verifies host keys against a known_hosts file, prompting through
// the injected HostKeyPrompter for unknown or changed keys.
type Verifier struct {
	path     string
	cb       knownhosts.HostKeyCallback
	prompter HostKeyPrompter
}

// NewVerifier loads (or creates) the known_hosts file. It ensures the
// parent dir is 0700 and the file 0600, and tolerates a file with some
// malformed lines by quarantining them (OpenSSH is lenient; x/crypto is
// not — one bad line otherwise fails every host).
func NewVerifier(knownHostsPath string, prompter HostKeyPrompter) (*Verifier, error) {
	if err := ensureKnownHostsFile(knownHostsPath); err != nil {
		return nil, err
	}
	cb, err := loadTolerant(knownHostsPath)
	if err != nil {
		return nil, err
	}
	return &Verifier{path: knownHostsPath, cb: cb, prompter: prompter}, nil
}

// HostKeyAlgorithms returns the key algorithms stored for hostWithPort, so
// the dialer can pin ClientConfig.HostKeyAlgorithms and avoid x/crypto
// negotiating an algorithm the file has no entry for (the false
// "key changed"). Empty slice for an unknown host — fall back to defaults.
func (v *Verifier) HostKeyAlgorithms(hostWithPort string) []string {
	return v.cb.HostKeyAlgorithms(hostWithPort)
}

// Callback returns the ssh.HostKeyCallback that classifies and prompts.
func (v *Verifier) Callback() ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		innerErr := v.cb(hostname, remote, key)
		if innerErr == nil {
			return nil // already trusted
		}

		// Revoked is a distinct type and a harder stop than "changed";
		// check it FIRST — errors.As(&*KeyError) is false for it.
		var revErr *xknownhosts.RevokedError
		if errors.As(innerErr, &revErr) {
			return domain.NewError(domain.CodeHostKeyRevoked,
				"This host key has been revoked. Connection cancelled.")
		}

		var keyErr *xknownhosts.KeyError
		if !errors.As(innerErr, &keyErr) {
			// Not a known-hosts verdict — surface as-is.
			return innerErr
		}

		req := HostKeyRequest{
			RequestID:   uuid.NewString(),
			Hostname:    hostname,
			KeyType:     key.Type(),
			Fingerprint: ssh.FingerprintSHA256(key),
			IsChanged:   len(keyErr.Want) > 0,
		}
		if req.IsChanged {
			req.OldFingerprint = ssh.FingerprintSHA256(keyErr.Want[0].Key)
		}

		accept, err := v.prompter.Prompt(req)
		if err != nil {
			return err // timeout / cancel — already a coded error from the prompter
		}
		if !accept {
			return domain.NewError(domain.CodeHostKeyRejected,
				"Host key was not accepted. Connection cancelled.")
		}

		if req.IsChanged {
			return v.replace(hostname, remote, key, keyErr.Want)
		}
		return v.append(hostname, remote, key)
	}
}

// ensureKnownHostsFile makes sure the dir is 0700 and the file exists 0600.
func ensureKnownHostsFile(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("cannot create %s: %w", dir, err)
	}
	if _, err := os.Stat(path); errors.Is(err, fs.ErrNotExist) {
		f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0o600) //nolint:gosec // G304: path is the caller-supplied known_hosts location (config/user home), not attacker input.
		if err != nil {
			return fmt.Errorf("cannot create %s: %w", path, err)
		}
		return f.Close()
	}
	return nil
}

// loadTolerant builds a callback from path. If x/crypto's strict parser
// rejects the file (one bad line fails all), it retries over a sanitized
// temp file containing only the parseable lines, so good hosts still work.
func loadTolerant(path string) (knownhosts.HostKeyCallback, error) {
	cb, err := knownhosts.New(path)
	if err == nil {
		return cb, nil
	}
	good, skipped := sanitizeKnownHosts(path)
	if skipped > 0 {
		// SEC-06: known_hosts holds no secrets, so logging line counts is
		// safe. Do not log the line contents.
		fmt.Fprintf(os.Stderr, "known_hosts: skipped %d unparseable line(s) in %s\n", skipped, path)
	}
	tmp, err := os.CreateTemp("", "sshmgr-kh-*")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	_, writeErr := tmp.WriteString(good)
	closeErr := tmp.Close()
	if err := firstErr(writeErr, closeErr); err != nil {
		return nil, err
	}
	return knownhosts.New(tmp.Name())
}

// firstErr returns the first non-nil error, or nil if all are nil. It
// exists so a sequence of fallible steps (write, then close, ...) can
// report whichever failed first without a chain of near-duplicate
// "if writeErr != nil { return writeErr }; if closeErr != nil { ... }"
// blocks at every call site.
func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

// sanitizeKnownHosts returns the parseable lines of path (as one string,
// newline-terminated) and the count skipped. Comments and blank lines are
// always kept verbatim without a trial parse: x/crypto's own reader already
// ignores them (see its Read loop), so re-validating them is pointless and
// they carry no risk of being "the" bad line. Every other line is
// trial-parsed alone, against a throwaway one-line file, so a single
// malformed line cannot take down the rest of the file — mirroring
// OpenSSH's tolerance for a corrupt known_hosts.
func sanitizeKnownHosts(path string) (good string, skipped int) {
	f, err := os.Open(path) //nolint:gosec // G304: path is the caller-supplied known_hosts location, not attacker input.
	if err != nil {
		return "", 0
	}
	defer func() { _ = f.Close() }()

	var b strings.Builder
	scanner := bufio.NewScanner(f)
	// bufio.Scanner's default 64KiB token cap is easy for a real
	// known_hosts line to exceed (a long comma-separated host-alias list,
	// or a certificate-format key), and Scan then stops SILENTLY: every
	// line after the over-long one vanishes from the sanitized output with
	// no signal at all (Finding B) — a partial-file read masquerading as a
	// complete one. Raise the cap to 1MiB, comfortably covering any
	// realistic line, and see the scanner.Err() check below for the
	// (now much rarer) case where it still isn't enough.
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			b.WriteString(line)
			b.WriteByte('\n')
			continue
		}
		if lineParses(line) {
			b.WriteString(line)
			b.WriteByte('\n')
		} else {
			skipped++
		}
	}
	if scanErr := scanner.Err(); scanErr != nil {
		// The scan stopped before reaching EOF (a token still over the
		// raised 1MiB cap, or a mid-file read error) — b holds only the
		// lines read before the failure point. Keep them rather than
		// discarding a partial-but-genuine result (loadTolerant's whole
		// purpose is that a problem elsewhere in the file must not take
		// down hosts that were already read fine), but make the truncation
		// LOUD instead of silent. SEC-06: known_hosts holds no secrets, so
		// the path and error are safe to log; line contents are not.
		fmt.Fprintf(os.Stderr, "known_hosts: %s: scan stopped early (%v); only the lines read before that point were kept\n", path, scanErr)
	}
	return b.String(), skipped
}

// lineParses reports whether line, alone in its own file, is a valid
// known_hosts entry.
func lineParses(line string) bool {
	tmp, err := os.CreateTemp("", "sshmgr-kh-trial-*")
	if err != nil {
		return false
	}
	name := tmp.Name()
	defer func() { _ = os.Remove(name) }()
	_, writeErr := tmp.WriteString(line + "\n")
	closeErr := tmp.Close()
	if writeErr != nil || closeErr != nil {
		return false
	}
	_, err = knownhosts.New(name)
	return err == nil
}

// append writes a new TOFU entry, repairing a missing trailing newline.
func (v *Verifier) append(hostname string, remote net.Addr, key ssh.PublicKey) error {
	f, err := os.OpenFile(v.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600) //nolint:gosec // G304: v.path is the caller-supplied known_hosts location, not attacker input.
	if err != nil {
		return keyWriteErr(err)
	}
	defer func() { _ = f.Close() }()
	if err := repairTrailingNewline(f); err != nil {
		return keyWriteErr(err)
	}
	if err := knownhosts.WriteKnownHost(f, hostname, remote, key); err != nil {
		return keyWriteErr(err)
	}
	return f.Sync()
}

// replace drops every REAL-file line that is a stale entry for hostname
// under one of the old keys in want, then appends the new key.
//
// Why match by KEY CONTENT and not by want[i].Filename/Line (the original,
// buggy approach): when the file was loaded through loadTolerant's
// sanitize-fallback path (see there), the knownhosts.HostKeyCallback was
// built over a throwaway temp file that is deleted before this method ever
// runs — so every KnownKey in want carries THAT temp file's path and line
// numbers, never v.path. Comparing k.Filename == v.path against that stale
// metadata matches nothing, so the old line is never removed from the real
// file: checkAddr (x/crypto/ssh/knownhosts) returns on the FIRST matching
// key it finds, so the leftover old entry goes on verifying silently on
// every future connection — a changed host key that is supposed to require
// a fresh prompt (SEC-03) instead never re-prompts. Matching on the key's
// marshaled bytes plus the host pattern is correct regardless of which
// file produced the KeyError, because it does not depend on any path
// recorded at parse time.
func (v *Verifier) replace(hostname string, remote net.Addr, key ssh.PublicKey, want []xknownhosts.KnownKey) error {
	if len(want) == 0 {
		return v.append(hostname, remote, key)
	}
	oldKeys := make([][]byte, 0, len(want))
	for _, k := range want {
		if k.Key != nil {
			oldKeys = append(oldKeys, k.Key.Marshal())
		}
	}
	if err := v.dropStaleLines(hostname, oldKeys); err != nil {
		return err
	}
	return v.append(hostname, remote, key)
}

// dropStaleLines rewrites v.path, omitting every line that shouldDropLine
// identifies as a stale entry for hostname/oldKeys. All other lines —
// including comments, blanks, marker (@cert-authority/@revoked) lines, and
// any line that fails to parse at all (e.g. the deliberately-quarantined
// malformed line loadTolerant tolerates) — are preserved verbatim and in
// order: this only ever removes lines it can positively identify as the
// stale entry being replaced.
func (v *Verifier) dropStaleLines(hostname string, oldKeys [][]byte) error {
	b, err := os.ReadFile(v.path) //nolint:gosec // G304: v.path is the caller-supplied known_hosts location, not attacker input.
	if err != nil {
		return keyWriteErr(err)
	}
	lines := strings.Split(string(b), "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if shouldDropLine(line, hostname, oldKeys) {
			continue
		}
		kept = append(kept, line)
	}
	if err := rewriteAtomic(v.path, strings.Join(kept, "\n")); err != nil {
		return keyWriteErr(err)
	}
	return nil
}

// shouldDropLine reports whether line is a plain (non-marker) known_hosts
// entry whose host pattern matches hostname and whose key equals one of
// oldKeys. A line that fails to parse, or that carries an
// @cert-authority/@revoked marker, is never dropped: this function only
// ever says "drop" when it can positively identify the line as the stale
// plain host-key entry being replaced.
func shouldDropLine(line, hostname string, oldKeys [][]byte) bool {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return false
	}
	marker, hosts, pubKey, _, _, err := ssh.ParseKnownHosts([]byte(line))
	if err != nil {
		return false // unparseable — preserve verbatim, never destroy user data we can't classify
	}
	if marker != "" {
		return false // @cert-authority / @revoked lines are out of scope for content-drop
	}
	marshaled := pubKey.Marshal()
	keyMatches := false
	for _, old := range oldKeys {
		if bytes.Equal(marshaled, old) {
			keyMatches = true
			break
		}
	}
	if !keyMatches {
		return false
	}
	return keyLineMatchesHost(hosts, hostname)
}

// keyLineMatchesHost reports whether hostPatterns — the comma-split host
// field of one known_hosts line, exactly as returned by
// ssh.ParseKnownHosts — matches hostname, the address string passed to the
// verifying ssh.HostKeyCallback (e.g. "10.0.1.20:22").
//
// This mirrors the negation-aware, wildcard/hashed matching rules of
// golang.org/x/crypto/ssh/knownhosts's own (unexported) hostPatterns.match
// and hashedHost.match closely enough to identify which real known_hosts
// lines correspond to the host under verification. Design boundary: it is
// used ONLY to select stale lines to drop after an accepted key change —
// never to grant trust — so an imperfect match here fails closed (a line
// that should have matched is instead left in place, at worst causing a
// harmless duplicate or a future re-prompt) rather than open (it never
// causes a line to be dropped, or a key to be trusted, that x/crypto's own
// verification would not also have matched).
func keyLineMatchesHost(hostPatterns []string, hostname string) bool {
	targetHost, targetPort := splitHostPortDefault(hostname)
	targetNorm := xknownhosts.Normalize(hostname)

	matched := false
	for _, raw := range hostPatterns {
		pattern := raw
		negate := strings.HasPrefix(pattern, "!")
		if negate {
			pattern = pattern[1:]
		}
		if pattern == "" {
			continue
		}

		var ok bool
		if strings.HasPrefix(pattern, "|") {
			ok = hashedPatternMatches(pattern, targetNorm)
		} else {
			patternHost, patternPort := splitHostPortDefault(pattern)
			ok = wildcardMatch(patternHost, targetHost) && patternPort == targetPort
		}
		if !ok {
			continue
		}
		if negate {
			return false
		}
		matched = true
	}
	return matched
}

// splitHostPortDefault splits s into host/port, defaulting port to "22"
// (known_hosts' implicit default, matching xknownhosts.Normalize) when s
// has no explicit port.
func splitHostPortDefault(s string) (host, port string) {
	if h, p, err := net.SplitHostPort(s); err == nil {
		return h, p
	}
	return s, "22"
}

// hashedPatternMatches reports whether the salted-HMAC-SHA1 hashed host
// pattern (the "|1|<base64 salt>|<base64 hash>" form OpenSSH's
// HashKnownHosts / ssh-keygen -H produce) matches targetNorm, the
// xknownhosts.Normalize'd form of the address under verification. SHA-1
// here only reproduces OpenSSH's own known_hosts hashing scheme so an
// EXISTING hashed line can be matched at all — it is not relied on for any
// new cryptographic guarantee, and the format is hardcoded by OpenSSH
// itself (x/crypto/ssh/knownhosts rejects any hash "type" other than "1").
// It reimplements golang.org/x/crypto/ssh/knownhosts's own unexported
// decodeHash+hashHost comparison because that logic is not exported.
func hashedPatternMatches(pattern, targetNorm string) bool {
	parts := strings.Split(pattern, "|")
	if len(parts) != 4 || parts[0] != "" || parts[1] != "1" {
		return false
	}
	salt, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	wantHash, err := base64.StdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	mac := hmac.New(sha1.New, salt)
	mac.Write([]byte(targetNorm))
	return hmac.Equal(mac.Sum(nil), wantHash)
}

// wildcardMatch reports whether str matches the '*'/'?' glob pattern pat,
// per the known_hosts host-pattern syntax (sshd(8)): '*' matches any run of
// characters, '?' matches exactly one. Ported from
// golang.org/x/crypto/ssh/knownhosts's unexported wildcardMatch (same
// algorithm) because this package needs the identical matching rule to
// identify stale known_hosts lines by content, and that helper is not
// exported.
func wildcardMatch(pat, str string) bool {
	p, s := []byte(pat), []byte(str)
	for {
		if len(p) == 0 {
			return len(s) == 0
		}
		if len(s) == 0 {
			return false
		}
		if p[0] == '*' {
			if len(p) == 1 {
				return true
			}
			for j := range s {
				if wildcardMatch(string(p[1:]), string(s[j:])) {
					return true
				}
			}
			return false
		}
		if p[0] == '?' || p[0] == s[0] {
			p = p[1:]
			s = s[1:]
		} else {
			return false
		}
	}
}

// rewriteAtomic replaces path's content with content via a temp file +
// rename in the same directory, so a crash mid-write cannot leave a
// half-written known_hosts in place of the user's file (and so a failure
// at any step — create, write, close, rename — leaves the original
// untouched and cleans up its own temp file).
func rewriteAtomic(path, content string) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "sshmgr-kh-rewrite-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	_, writeErr := tmp.WriteString(content)
	closeErr := tmp.Close()
	rewriteErr := firstErr(writeErr, closeErr)
	if rewriteErr == nil {
		rewriteErr = os.Rename(name, path)
	}
	if rewriteErr != nil {
		_ = os.Remove(name)
		return rewriteErr
	}
	return nil
}

// repairTrailingNewline ensures an append lands on its own line: if f
// already has content and its last byte is not '\n', it writes one first.
// f is expected open O_APPEND, so the write lands at the true end
// regardless of the current seek position used by the peek below.
//
// f itself is open O_WRONLY (append's verbatim OpenFile flags), which
// cannot ReadAt — that fails with "bad file descriptor" even though the
// underlying file permissions allow reading, since the restriction is on
// the fd's open mode, not the file's mode bits. So the last byte is peeked
// through a second, read-only handle on the same path instead of reading
// through f.
func repairTrailingNewline(f *os.File) error {
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.Size() == 0 {
		return nil
	}
	rf, err := os.Open(f.Name()) //nolint:gosec // G304: f.Name() is the known_hosts path this same call already opened for writing; not attacker input.
	if err != nil {
		return err
	}
	defer func() { _ = rf.Close() }()
	last := make([]byte, 1)
	if _, err := rf.ReadAt(last, info.Size()-1); err != nil {
		return err
	}
	if last[0] == '\n' {
		return nil
	}
	_, err = f.Write([]byte("\n"))
	return err
}

// keyWriteErr wraps a known_hosts write failure as a coded domain error.
// There is no dedicated TZ code for "could not persist a host key", and
// this is a local file-permission/disk problem rather than bad input from
// the user — CodeValidation is the closest existing coded bucket and keeps
// the message actionable without inventing a new wire-visible code.
func keyWriteErr(err error) error {
	return domain.NewError(domain.CodeValidation,
		fmt.Sprintf("Could not update the known_hosts file: %v", err))
}
