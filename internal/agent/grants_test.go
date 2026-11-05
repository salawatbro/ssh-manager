package agent

import (
	"crypto/rand"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

var iterm = Holder{PID: 812, Start: 1_700_000_000_000_000, Path: "/Applications/iTerm.app/Contents/MacOS/iTerm2", Name: "iTerm"}

func signAs(f *fixture, pub ssh.PublicKey, h Holder) error {
	_, err := f.core.sign(signRequest{pub: pub, data: []byte("d"), client: ClientInfo{
		Name: "ssh", App: "iTerm", Chain: []string{"ssh", "zsh", "login", "iTerm2"}, holderAt: 3, Holder: h,
	}})
	return err
}

func mustSign(t *testing.T, f *fixture, pub ssh.PublicKey, h Holder) {
	t.Helper()
	if err := signAs(f, pub, h); err != nil {
		t.Fatal(err)
	}
}

func TestGrantCoversSameAppAndKey(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	other := f.keys.add(t, "k2", "github", newEd25519(t), true)
	f.conf.set(true, GrantFor15Min)

	mustSign(t, f, pub, iterm)
	grants := f.core.Grants()
	if len(grants) != 1 {
		t.Fatalf("grants = %+v", grants)
	}
	g := grants[0]
	if g.KeyID != "k1" || g.App != "iTerm" || g.Chain != "ssh ← zsh ← login" || g.Length != GrantFor15Min ||
		g.ExpiresAt == nil || !g.ExpiresAt.Equal(f.clk.Now().Add(15*time.Minute)) {
		t.Fatalf("grant = %+v", g)
	}
	if !f.conf.requests()[0].Grantable {
		t.Fatal("first request was not grantable")
	}

	mustSign(t, f, pub, iterm)
	if n := len(f.conf.requests()); n != 1 {
		t.Fatalf("prompts = %d, want 1: the approval should cover the second signature", n)
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignGranted || ev.Detail != "Approval for 15 minutes" {
		t.Fatalf("event = %+v", ev)
	}
	if uses := f.core.Grants()[0].Uses; uses != 1 {
		t.Fatalf("uses = %d", uses)
	}

	restarted := iterm
	restarted.Start++
	mustSign(t, f, pub, restarted)
	mustSign(t, f, other, iterm)
	if n := len(f.conf.requests()); n != 3 {
		t.Fatalf("prompts = %d, want 3: another app instance and another key must ask", n)
	}
}

func TestGrantExpires(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(true, GrantFor15Min)
	mustSign(t, f, pub, iterm)

	f.clk.advance(15*time.Minute - time.Second)
	mustSign(t, f, pub, iterm)
	f.clk.advance(time.Second)
	if len(f.core.Grants()) != 0 {
		t.Fatal("expired approval still listed")
	}
	f.conf.set(true, GrantOnce)
	mustSign(t, f, pub, iterm)
	if n := len(f.conf.requests()); n != 2 {
		t.Fatalf("prompts = %d, want 2", n)
	}
}

func TestGrantOnceOpensNothing(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(true, GrantOnce)
	mustSign(t, f, pub, iterm)
	mustSign(t, f, pub, iterm)
	if len(f.core.Grants()) != 0 || len(f.conf.requests()) != 2 {
		t.Fatalf("grants %d, prompts %d", len(f.core.Grants()), len(f.conf.requests()))
	}
}

func TestLockClearsGrants(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	changes := 0
	f.core.OnChange(func() { changes++ })
	f.conf.set(true, GrantUntilLock)
	mustSign(t, f, pub, iterm)
	if g := f.core.Grants(); len(g) != 1 || g[0].ExpiresAt != nil {
		t.Fatalf("grants = %+v", g)
	}

	f.lock.v.Store(true)
	mustSign(t, f, pub, iterm)
	reqs := f.conf.requests()
	if len(reqs) != 2 || !reqs[1].Locked || reqs[1].Grantable {
		t.Fatalf("an approval was used or offered while locked: %+v", reqs)
	}
	f.lock.v.Store(false)

	f.core.Invalidate() // what gate.OnLock runs
	if len(f.core.Grants()) != 0 {
		t.Fatal("approval survived the lock")
	}
	if changes != 2 {
		t.Fatalf("OnChange ran %d times, want 2 (open, clear)", changes)
	}
	mustSign(t, f, pub, iterm)
	if n := len(f.conf.requests()); n != 3 {
		t.Fatalf("prompts = %d, want 3", n)
	}
}

func TestLockDuringPromptOpensNoGrant(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(true, GrantUntilLock)
	f.conf.release = make(chan struct{})
	f.conf.started = make(chan struct{}, 1)
	done := make(chan error, 1)
	go func() { done <- signAs(f, pub, iterm) }()
	<-f.conf.started
	f.core.Invalidate()
	close(f.conf.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if len(f.core.Grants()) != 0 {
		t.Fatal("an approval answered across a lock stayed open")
	}
}

func TestGrantNeverCoversProd(t *testing.T) {
	f := newFixture(t)
	f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	never := true
	f.core.SetNeverProd(func() bool { return never })
	f.conf.set(true, GrantUntilLock)
	prod, err := f.core.Signer("k1", ClientInfo{Purpose: "tunnel", Target: Host{Name: "db-primary", Env: "prod"}})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := prod.Sign(rand.Reader, []byte("d")); err != nil {
			t.Fatal(err)
		}
	}
	reqs := f.conf.requests()
	if len(reqs) != 2 || reqs[0].Grantable || len(f.core.Grants()) != 0 {
		t.Fatalf("production was approved for longer: grants %+v, requests %+v", f.core.Grants(), reqs)
	}

	never = false
	for i := 0; i < 2; i++ {
		if _, err := prod.Sign(rand.Reader, []byte("d")); err != nil {
			t.Fatal(err)
		}
	}
	if n := len(f.conf.requests()); n != 3 {
		t.Fatalf("prompts = %d, want 3 with the setting off", n)
	}
	if g := f.core.Grants(); len(g) != 1 || g[0].App != "Zish" || g[0].Chain != "tunnel" {
		t.Fatalf("grants = %+v", g)
	}
}

// prodKeyResolver names every host key and says every key is on production.
type prodKeyResolver struct{ name string }

func (r prodKeyResolver) Resolve(ssh.PublicKey) Host { return Host{Name: r.name, Env: "staging"} }

func (prodKeyResolver) KeyOnProd(string) bool { return true }

// userauthData is the start of an SSH userauth request for session sid.
func userauthData(sid []byte) []byte {
	return append(ssh.Marshal(struct{ SessionID []byte }{sid}), 50, 0, 0, 0, 1, 'u')
}

func TestGrantProdNeedsAProvenDestination(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	host, _ := ssh.NewSignerFromKey(newEd25519(t))
	f.core.SetHostResolver(prodKeyResolver{name: "staging-db"})
	f.core.SetNeverProd(func() bool { return true })
	ag := pipeAgent(t, f.core, ClientInfo{Name: "ssh", Holder: iterm})

	// No session-bind: the key also signs in to production, so no approval.
	if _, err := ag.Sign(pub, userauthData([]byte("sid"))); err != nil {
		t.Fatal(err)
	}
	// Bound, but the signed data belongs to another session.
	if _, err := ag.Extension(extSessionBind, sessionBindPayload(t, host, []byte("sid"), false, false)); err != nil {
		t.Fatal(err)
	}
	if _, err := ag.Sign(pub, userauthData([]byte("other"))); err != nil {
		t.Fatal(err)
	}
	// Proven: the bind's session opens the signed request.
	if _, err := ag.Sign(pub, userauthData([]byte("sid"))); err != nil {
		t.Fatal(err)
	}
	reqs := f.conf.requests()
	if len(reqs) != 3 || reqs[0].Grantable || reqs[1].Grantable || !reqs[2].Grantable {
		t.Fatalf("grantable = %v %v %v", reqs[0].Grantable, reqs[1].Grantable, reqs[2].Grantable)
	}
	if reqs[1].Destination != "staging-db" || reqs[2].Host.Env != "staging" {
		t.Fatalf("destination = %q / %+v", reqs[1].Destination, reqs[2].Host)
	}
}

func TestRevokeAndForgetGrants(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(true, GrantFor15Min)
	mustSign(t, f, pub, iterm)
	id := f.core.Grants()[0].ID
	if f.core.RevokeGrant("nope") || !f.core.RevokeGrant(id) || len(f.core.Grants()) != 0 {
		t.Fatal("revoke did not close exactly that approval")
	}
	mustSign(t, f, pub, iterm)
	if n := len(f.conf.requests()); n != 2 {
		t.Fatalf("prompts = %d after revoke", n)
	}
	f.core.Forget("k1")
	if len(f.core.Grants()) != 0 {
		t.Fatal("Forget kept the key's approval")
	}
}

func TestGrantNeedsAKnownHolder(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(true, GrantUntilLock)
	mustSign(t, f, pub, Holder{PID: 99})
	if f.conf.requests()[0].Grantable || len(f.core.Grants()) != 0 {
		t.Fatal("approval bound to a process without a start time")
	}
}

func TestQueuedRequestUsesTheNewGrant(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(true, GrantFor15Min)
	f.conf.release = make(chan struct{})
	f.conf.started = make(chan struct{}, 2)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	wg.Add(1)
	go func() { defer wg.Done(); errs <- signAs(f, pub, iterm) }()
	<-f.conf.started
	wg.Add(1)
	go func() { defer wg.Done(); errs <- signAs(f, pub, iterm) }()
	deadline := time.Now().Add(5 * time.Second)
	for len(f.core.pending) < 2 {
		if time.Now().After(deadline) {
			t.Fatal("second request never queued")
		}
		time.Sleep(time.Millisecond)
	}
	close(f.conf.release)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if n := len(f.conf.requests()); n != 1 {
		t.Fatalf("prompts = %d, want 1", n)
	}
}

func TestParseGrantLengthAndReason(t *testing.T) {
	for in, want := range map[string]GrantLength{"15m": GrantFor15Min, "lock": GrantUntilLock, "once": GrantOnce, "forever": GrantOnce, "": GrantOnce} {
		if got := ParseGrantLength(in); got != want {
			t.Errorf("ParseGrantLength(%q) = %q", in, got)
		}
	}
	req := ConfirmRequest{KeyName: "k", Client: ClientInfo{Name: "ssh"}, Destination: "db", Grantable: true}
	if got := ApprovalReason(req, GrantFor15Min); got != `use the SSH key "k" for ssh → db, and again for 15 minutes` {
		t.Fatalf("reason = %q", got)
	}
	req.Grantable = false
	if got := ApprovalReason(req, GrantUntilLock); got != `use the SSH key "k" for ssh → db` {
		t.Fatalf("reason = %q", got)
	}
}
