package service

import (
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/term"
)

func TestLocalOpenReturnsSessionAndShell(t *testing.T) {
	mgr := term.NewManager(nopEmitter{}, 16*time.Millisecond, 30*time.Second)
	t.Cleanup(func() { mgr.CloseAll() })
	svc := NewLocalService(mgr)

	res, err := svc.Open(80, 24)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if res.SessionID == "" {
		t.Fatal("SessionID is empty")
	}
	if res.Shell == "" {
		t.Error("Shell is empty — a local shell is always known")
	}
	// Registered in the SAME manager as SSH sessions, which is what lets the
	// frontend keep using SSHService.Write/Resize/Close for a local pane.
	if err := mgr.Resize(res.SessionID, 100, 30); err != nil {
		t.Errorf("Resize through the manager: %v", err)
	}
	if err := mgr.Close(res.SessionID); err != nil {
		t.Errorf("Close through the manager: %v", err)
	}
}
