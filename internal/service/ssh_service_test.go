package service

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

func newRepo(t *testing.T) *store.ServerRepo {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	return store.NewServerRepo(db)
}

// ConfirmHostKey delegates to the wired HostKeyPrompter's Resolve: a pending
// Prompt blocked on the prompter's channel unblocks with the user's verdict.
func TestConfirmHostKeyDelegatesToPrompterResolve(t *testing.T) {
	hp := NewHostKeyPrompter(&fakeEmitter{})
	svc := NewSSHService(hp, NewCodePrompter(&fakeCodeEmitter{}))

	go func() {
		// Wait until Prompt has registered its channel, then confirm.
		time.Sleep(20 * time.Millisecond)
		if err := svc.ConfirmHostKey("r1", true); err != nil {
			t.Errorf("ConfirmHostKey: %v", err)
		}
	}()
	accept, err := hp.Prompt(sshx.HostKeyRequest{RequestID: "r1"})
	if err != nil || !accept {
		t.Fatalf("accept=%v err=%v", accept, err)
	}
}

// SubmitCode delegates to the wired CodePrompter's Resolve: a pending
// Prompt blocked on the prompter's channel unblocks with the submitted code.
func TestSubmitCodeDelegatesToPrompterResolve(t *testing.T) {
	cp := NewCodePrompter(&fakeCodeEmitter{})
	svc := NewSSHService(NewHostKeyPrompter(&fakeEmitter{}), cp)

	go func() {
		// Wait until Prompt has registered its channel, then submit.
		time.Sleep(20 * time.Millisecond)
		if err := svc.SubmitCode("r1", "123456"); err != nil {
			t.Errorf("SubmitCode: %v", err)
		}
	}()
	code, err := cp.Prompt(sshx.CodeRequest{RequestID: "r1"})
	if err != nil || code != "123456" {
		t.Fatalf("code=%q err=%v", code, err)
	}
}

// SubmitCode for an unknown request id is an error (stale submit after
// timeout, or a code prompter with nothing pending at all).
func TestSubmitCodeUnknownRequestErrors(t *testing.T) {
	svc := NewSSHService(NewHostKeyPrompter(&fakeEmitter{}), NewCodePrompter(&fakeCodeEmitter{}))
	if err := svc.SubmitCode("ghost", "123456"); err == nil {
		t.Fatal("SubmitCode on an unknown request id should error")
	}
}
