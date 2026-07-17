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
	chain := []sshx.Hop{{Creds: sshx.Credentials{Password: "p", Passphrase: "q"}}}
	zeroChainCreds(chain)
	if chain[0].Creds.Password != "" || chain[0].Creds.Passphrase != "" {
		t.Fatalf("creds not wiped: %+v", chain[0].Creds)
	}
}
