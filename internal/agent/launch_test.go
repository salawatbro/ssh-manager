package agent

import (
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

func stackRequest(keys ...string) LaunchRequest {
	return LaunchRequest{
		Stack: "Deploy api", KeyIDs: keys,
		Servers: []Host{{Name: "api-prod", Env: "prod"}, {Name: "db-primary", Env: "prod"}},
		Tunnels: []string{"postgres"},
	}
}

// signFrom signs as an ssh whose process chain is procs, nearest first.
func signFrom(f *fixture, pub ssh.PublicKey, forwarded bool, procs ...procID) error {
	_, err := f.core.sign(signRequest{pub: pub, data: []byte("d"), forwarded: forwarded, client: ClientInfo{
		Name: "ssh", App: "iTerm", Chain: []string{"ssh", "sh", "iTerm2"}, holderAt: 2, Holder: iterm, procs: procs,
	}})
	return err
}

func signInProcess(t *testing.T, f *fixture, keyID string) error {
	t.Helper()
	s, err := f.core.Signer(keyID, ClientInfo{Purpose: "tunnel postgres", Target: Host{Name: "db-primary", Env: "prod"}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Sign(nil, []byte("d"))
	return err
}

func TestApproveLaunchWithoutConfirmKeysAsksNothing(t *testing.T) {
	f := newFixture(t)
	f.keys.add(t, "k1", "deploy", newEd25519(t), false)
	scope, err := f.core.ApproveLaunch(stackRequest("k1", "gone"))
	if err != nil || scope.Active() {
		t.Fatalf("scope active %v, err %v", scope.Active(), err)
	}
	if n := len(f.conf.requests()); n != 0 {
		t.Fatalf("prompts = %d", n)
	}
	scope.Attach(os.Getpid())
	scope.Close()
}

// One approval covers the stack's tunnels (in-process) and the ssh processes
// attached to it, production included, for one minute.
func TestLaunchApprovalCoversTheStackForOneMinute(t *testing.T) {
	f := newFixture(t)
	f.core.SetNeverProd(func() bool { return true })
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.keys.add(t, "k2", "bastion", newEd25519(t), true)
	f.keys.add(t, "k3", "other", newEd25519(t), true)

	scope, err := f.core.ApproveLaunch(stackRequest("k1", "k2", "k1"))
	if err != nil || !scope.Active() {
		t.Fatalf("ApproveLaunch = %v, %v", scope, err)
	}
	reqs := f.conf.requests()
	if len(reqs) != 1 || reqs[0].Launch == nil || reqs[0].Grantable {
		t.Fatalf("prompt = %+v", reqs)
	}
	if l := reqs[0].Launch; l.Stack != "Deploy api" || len(l.Keys) != 2 || len(l.Servers) != 2 || l.Tunnels[0] != "postgres" {
		t.Fatalf("launch prompt = %+v", l)
	}
	if got := ConfirmReason(reqs[0]); got != `open the stack "Deploy api" and use the SSH keys "deploy", "bastion" for one minute` {
		t.Fatalf("reason = %q", got)
	}

	if err := signInProcess(t, f, "k1"); err != nil {
		t.Fatalf("tunnel signature: %v", err)
	}
	sshProc := procID{pid: 4242, start: 7}
	scope.core.mu.Lock()
	scope.g.procs[sshProc] = true
	scope.core.mu.Unlock()
	if err := signFrom(f, pub, false, procID{pid: 4300, start: 9}, sshProc); err != nil {
		t.Fatalf("jump ssh under the attached ssh: %v", err)
	}
	if n := len(f.conf.requests()); n != 1 {
		t.Fatalf("prompts = %d, want the one launch prompt", n)
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignGranted || ev.Detail != "One approval for the stack Deploy api" {
		t.Fatalf("event = %+v", ev)
	}

	f.conf.set(true, GrantOnce)
	if err := signFrom(f, pub, false, procID{pid: 4242, start: 8}); err != nil {
		t.Fatal(err)
	}
	if err := signFrom(f, pub, true, sshProc); err != nil {
		t.Fatal(err)
	}
	if err := signInProcess(t, f, "k3"); err != nil {
		t.Fatal(err)
	}
	if n := len(f.conf.requests()); n != 4 {
		t.Fatalf("prompts = %d: a reused pid, a forwarded request and another key must ask", n)
	}

	f.clk.advance(LaunchWindow)
	if err := signInProcess(t, f, "k1"); err != nil {
		t.Fatal(err)
	}
	if n := len(f.conf.requests()); n != 5 {
		t.Fatalf("prompts = %d: the approval must end after one minute", n)
	}
}

func TestLaunchApprovalAttachesARealProcess(t *testing.T) {
	start, ok := procStart(os.Getpid())
	if !ok {
		t.Skip("no process start times on this platform")
	}
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	scope, err := f.core.ApproveLaunch(stackRequest("k1"))
	if err != nil {
		t.Fatal(err)
	}
	scope.Attach(os.Getpid())
	scope.Attach(0)
	if err := signFrom(f, pub, false, procID{os.Getpid(), start}); err != nil {
		t.Fatal(err)
	}
	if n := len(f.conf.requests()); n != 1 {
		t.Fatalf("prompts = %d", n)
	}
}

func TestLaunchApprovalDeniedOrLocked(t *testing.T) {
	f := newFixture(t)
	f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	f.conf.set(false, GrantOnce)
	if _, err := f.core.ApproveLaunch(stackRequest("k1")); !errors.Is(err, ErrLaunchDenied) {
		t.Fatalf("denied = %v", err)
	}
	if len(f.core.launches) != 0 {
		t.Fatal("a denied launch opened an approval")
	}
	f.lock.v.Store(true)
	if _, err := f.core.ApproveLaunch(stackRequest("k1")); err == nil {
		t.Fatal("ApproveLaunch ran while Zish was locked")
	}
	if n := len(f.conf.requests()); n != 1 {
		t.Fatalf("prompts = %d", n)
	}
}

func TestLockAndCloseEndLaunchApprovals(t *testing.T) {
	f := newFixture(t)
	f.keys.add(t, "k1", "deploy", newEd25519(t), true)
	if _, err := f.core.ApproveLaunch(stackRequest("k1")); err != nil {
		t.Fatal(err)
	}
	f.core.Invalidate()
	if err := signInProcess(t, f, "k1"); err != nil {
		t.Fatal(err)
	}
	if n := len(f.conf.requests()); n != 2 {
		t.Fatalf("prompts = %d: a lock must end the stack approval", n)
	}

	scope, err := f.core.ApproveLaunch(stackRequest("k1"))
	if err != nil {
		t.Fatal(err)
	}
	scope.Close()
	f.clk.advance(time.Second)
	if err := signInProcess(t, f, "k1"); err != nil {
		t.Fatal(err)
	}
	if n := len(f.conf.requests()); n != 4 {
		t.Fatalf("prompts = %d: Close must end the stack approval", n)
	}
	if strings.Contains(f.log.last(t).Detail, "stack") {
		t.Fatal("a closed approval still covered a signature")
	}
}
