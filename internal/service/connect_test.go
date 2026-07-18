package service

import (
	"errors"
	"fmt"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// strptr returns a pointer to s — domain.Server.JumpID is *string, and a
// server literal needs the address of a local, not of an unaddressable
// string constant.
func strptr(s string) *string { return &s }

// mkServer creates and stores a minimal agent-auth server with the given
// jump (nil for none). AuthAgent needs no stored secret, so these are pure
// jump-topology fixtures; TestResolveChainLoadsPerHopCreds seeds a real
// secret directly on the one hop that needs it.
func mkServer(t *testing.T, repo *store.ServerRepo, id string, jump *string) *domain.Server {
	t.Helper()
	s := &domain.Server{
		ID: id, Name: id, Host: "h", User: "u", Port: 22,
		AuthType: domain.AuthAgent, JumpID: jump,
	}
	if err := repo.Create(s); err != nil {
		t.Fatalf("Create(%s): %v", id, err)
	}
	return s
}

// codeOf extracts the domain.Error code from err, failing the test if err
// isn't a coded domain error.
func codeOf(t *testing.T, err error) string {
	t.Helper()
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("error is not a domain.Error: %v", err)
	}
	return de.Code
}

func TestResolveChainJumplessTarget(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	tgt := mkServer(t, repo, "t", nil)

	chain, err := resolveChain(repo, sec, tgt)
	if err != nil {
		t.Fatalf("resolveChain: %v", err)
	}
	if len(chain) != 1 || chain[0].Server.ID != "t" {
		t.Fatalf("chain = %+v; want 1-element [t]", chain)
	}
}

func TestResolveChainOrderRootFirst(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	mkServer(t, repo, "b", nil)
	mkServer(t, repo, "a", strptr("b"))
	tgt := mkServer(t, repo, "t", strptr("a"))

	chain, err := resolveChain(repo, sec, tgt)
	if err != nil {
		t.Fatalf("resolveChain: %v", err)
	}
	if len(chain) != 3 {
		t.Fatalf("chain len = %d; want 3", len(chain))
	}
	got := []string{chain[0].Server.ID, chain[1].Server.ID, chain[2].Server.ID}
	if got[0] != "b" || got[1] != "a" || got[2] != "t" {
		t.Fatalf("order = %v; want [b a t]", got)
	}
}

func TestResolveChainCycle(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	mkServer(t, repo, "b", nil)
	a := mkServer(t, repo, "a", strptr("b"))
	// Close the loop by pointing b's jump at a. b must exist before a
	// references it — foreign_keys(1) is enforced immediately (not
	// deferred) — so the loop is closed with an Update after both rows
	// exist, not by creating either row with a dangling jump_id.
	b, err := repo.Get("b")
	if err != nil {
		t.Fatal(err)
	}
	b.JumpID = strptr("a")
	if err := repo.Update(b); err != nil {
		t.Fatal(err)
	}

	if _, err := resolveChain(repo, sec, a); err == nil || codeOf(t, err) != domain.CodeJumpCycle {
		t.Fatalf("cycle: got %v; want ERR_JUMP_CYCLE", err)
	}
}

func TestResolveChainDepthExceeded(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	// s0 (root, no jump) <- s1 <- s2 <- ... <- s(maxJumpDepth+1): resolving
	// the tail walks maxJumpDepth+2 hops, one more than resolveChain allows.
	var prev *string
	var last *domain.Server
	for i := 0; i <= maxJumpDepth+1; i++ {
		id := fmt.Sprintf("s%d", i)
		last = mkServer(t, repo, id, prev)
		prev = strptr(id)
	}

	if _, err := resolveChain(repo, sec, last); err == nil || codeOf(t, err) != domain.CodeJumpFailed {
		t.Fatalf("depth: got %v; want ERR_JUMP_FAILED", err)
	}
}

func TestResolveChainLoadsPerHopCreds(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()

	root := &domain.Server{ID: "root", Name: "root", Host: "h", User: "u", Port: 22, AuthType: domain.AuthPassword}
	if err := repo.Create(root); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetPassword("root", "s3cret"); err != nil {
		t.Fatal(err)
	}
	tgt := mkServer(t, repo, "t", strptr("root")) // agent auth — no stored secret

	chain, err := resolveChain(repo, sec, tgt)
	if err != nil {
		t.Fatalf("resolveChain: %v", err)
	}
	if len(chain) != 2 {
		t.Fatalf("chain len = %d; want 2", len(chain))
	}
	if chain[0].Server.ID != "root" || chain[0].Creds.Password != "s3cret" {
		t.Fatalf("root hop creds = %+v; want password s3cret", chain[0])
	}
	if chain[1].Server.ID != "t" || chain[1].Creds.Password != "" {
		t.Fatalf("target hop creds = %+v; want empty (agent auth)", chain[1])
	}
}

func TestZeroChainCredsWipesSecrets(t *testing.T) {
	chain := []sshx.Hop{{Creds: sshx.Credentials{Password: "p", Passphrase: "q", TOTPSecret: "r"}}}
	zeroChainCreds(chain)
	if chain[0].Creds.Password != "" || chain[0].Creds.Passphrase != "" || chain[0].Creds.TOTPSecret != "" {
		t.Fatalf("creds not wiped: %+v", chain[0].Creds)
	}
}

// TOTP is orthogonal to the primary auth method: a TwoFactor password server
// with a stored TOTP secret gets BOTH the password and the TOTP secret in
// its creds — TOTP never replaces the primary auth.
func TestCredsForAttachesStoredTOTPSecret(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	srv := &domain.Server{ID: "t", Name: "t", Host: "h", User: "u", Port: 22, AuthType: domain.AuthPassword, TwoFactor: true}
	if err := repo.Create(srv); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetPassword("t", "pw"); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetTOTPSecret("t", "GEZDGNBVGY3TQOJQ"); err != nil {
		t.Fatal(err)
	}

	creds, err := credsFor(sec, srv)
	if err != nil {
		t.Fatalf("credsFor: %v", err)
	}
	if creds.TOTPSecret != "GEZDGNBVGY3TQOJQ" {
		t.Fatalf("TOTPSecret = %q, want the stored secret", creds.TOTPSecret)
	}
	if creds.Password != "pw" {
		t.Fatalf("Password = %q, want pw (TOTP must not replace the primary auth creds)", creds.Password)
	}
}

// A TwoFactor server with 2FA turned on but no TOTP secret stored yet (the
// user hasn't entered one) must not fail the whole connect — credsFor
// tolerates ErrNotStored and leaves TOTPSecret empty, letting the
// keyboard-interactive challenge fall back to the interactive CodePrompter.
func TestCredsForTOTPMissingSecretIsNotAnError(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	srv := &domain.Server{ID: "t", Name: "t", Host: "h", User: "u", Port: 22, AuthType: domain.AuthPassword, TwoFactor: true}
	if err := repo.Create(srv); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetPassword("t", "pw"); err != nil {
		t.Fatal(err)
	}
	// No TOTP secret stored.

	creds, err := credsFor(sec, srv)
	if err != nil {
		t.Fatalf("credsFor: %v", err)
	}
	if creds.TOTPSecret != "" {
		t.Fatalf("TOTPSecret = %q, want empty when nothing is stored", creds.TOTPSecret)
	}
}

// A non-2FA server must never pick up a TOTP secret, even one sitting in the
// keychain under its id (e.g. left over from 2FA having been turned off).
func TestCredsForNonTwoFactorServerUnaffected(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()
	srv := &domain.Server{ID: "t", Name: "t", Host: "h", User: "u", Port: 22, AuthType: domain.AuthPassword}
	if err := repo.Create(srv); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetPassword("t", "pw"); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetTOTPSecret("t", "GEZDGNBVGY3TQOJQ"); err != nil {
		t.Fatal(err)
	}

	creds, err := credsFor(sec, srv)
	if err != nil {
		t.Fatalf("credsFor: %v", err)
	}
	if creds.TOTPSecret != "" {
		t.Fatalf("TOTPSecret = %q, want empty for a non-2FA server", creds.TOTPSecret)
	}
}

// resolveChain must apply the TOTP-secret attach to whichever hop actually
// has TwoFactor set — here the target, with a plain jump host in front of
// it — and leave every other hop's TOTPSecret empty.
func TestResolveChainAttachesTOTPSecretToTheHopThatNeedsIt(t *testing.T) {
	repo := newRepo(t)
	sec := secret.NewFake()

	mkServer(t, repo, "root", nil) // agent auth, no 2FA
	tgt := &domain.Server{ID: "t", Name: "t", Host: "h", User: "u", Port: 22, AuthType: domain.AuthPassword, TwoFactor: true, JumpID: strptr("root")}
	if err := repo.Create(tgt); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetPassword("t", "pw"); err != nil {
		t.Fatal(err)
	}
	if err := sec.SetTOTPSecret("t", "GEZDGNBVGY3TQOJQ"); err != nil {
		t.Fatal(err)
	}

	chain, err := resolveChain(repo, sec, tgt)
	if err != nil {
		t.Fatalf("resolveChain: %v", err)
	}
	last := chain[len(chain)-1]
	if last.Server.ID != "t" || last.Creds.TOTPSecret != "GEZDGNBVGY3TQOJQ" {
		t.Fatalf("target hop creds = %+v; want TOTPSecret set", last)
	}
	if chain[0].Creds.TOTPSecret != "" {
		t.Fatalf("root hop (non-2FA) TOTPSecret = %q, want empty", chain[0].Creds.TOTPSecret)
	}
}
