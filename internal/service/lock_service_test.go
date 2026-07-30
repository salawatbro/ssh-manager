package service

import (
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

func newPinSvc() (*LockService, *secret.Fake) {
	f := secret.NewFake()
	return NewLockService(f, nil, nil, nil, nil, nil), f
}

func TestSetAndVerifyPin(t *testing.T) {
	svc, _ := newPinSvc()
	if svc.HasPin() {
		t.Fatal("HasPin true before any SetPin")
	}
	if err := svc.SetPin("123456"); err != nil {
		t.Fatalf("SetPin: %v", err)
	}
	if !svc.HasPin() {
		t.Fatal("HasPin false after SetPin")
	}
	ok, err := svc.VerifyPin("123456")
	if err != nil || !ok {
		t.Fatalf("VerifyPin(correct) = %v, %v; want true, nil", ok, err)
	}
	ok, err = svc.VerifyPin("000000")
	if err != nil || ok {
		t.Fatalf("VerifyPin(wrong) = %v, %v; want false, nil", ok, err)
	}
}

func TestSetPinRejectsBadFormat(t *testing.T) {
	svc, _ := newPinSvc()
	for _, bad := range []string{"", "1234", "1234567", "12a456", "abcdef"} {
		if err := svc.SetPin(bad); err == nil {
			t.Errorf("SetPin(%q) = nil, want error", bad)
		}
	}
}

func TestChangeAndRemovePin(t *testing.T) {
	svc, _ := newPinSvc()
	if err := svc.SetPin("111111"); err != nil {
		t.Fatal(err)
	}
	if err := svc.ChangePin("999999", "222222"); err == nil {
		t.Error("ChangePin with wrong current = nil, want error")
	}
	if err := svc.ChangePin("111111", "222222"); err != nil {
		t.Fatalf("ChangePin: %v", err)
	}
	if ok, _ := svc.VerifyPin("222222"); !ok {
		t.Error("new PIN does not verify after ChangePin")
	}
	if err := svc.RemovePin("000000"); err == nil {
		t.Error("RemovePin with wrong current = nil, want error")
	}
	if err := svc.RemovePin("222222"); err != nil {
		t.Fatalf("RemovePin: %v", err)
	}
	if svc.HasPin() {
		t.Error("HasPin true after RemovePin")
	}
}

// TestResetAll exercises the forgot-PIN factory reset against a real
// in-memory-style DB. It deliberately includes a jump-host server (jumper
// references srv via JumpID) to prove the reset clears jump hosts too: a
// naive per-id Delete loop would fail on srv while jumper still references
// it via the jump_id NO ACTION foreign key, but the bulk DeleteAll used by
// ResetAll removes every row in one statement, so the constraint is
// satisfied at statement end.
func TestResetAll(t *testing.T) {
	db, err := store.Open(t.TempDir() + "/db.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	servers := store.NewServerRepo(db)
	snippets := store.NewSnippetRepo(db)
	sessions := store.NewSessionStateRepo(db)
	logs := store.NewSessionLogRepo(db)
	settingsRepo := store.NewSettingsRepo(db)
	f := secret.NewFake()

	srv := &domain.Server{ID: "s1", Name: "web", Host: "example.com", Port: 22, User: "root", AuthType: domain.AuthPassword, Environment: domain.EnvNone}
	if err := servers.Create(srv); err != nil {
		t.Fatal(err)
	}
	jumper := &domain.Server{ID: "s2", Name: "via", Host: "b.example.com", Port: 22, User: "root", AuthType: domain.AuthPassword, Environment: domain.EnvNone, JumpID: &srv.ID}
	if err := servers.Create(jumper); err != nil {
		t.Fatal(err)
	}
	_ = f.SetPassword(srv.ID, "secret")
	_ = f.SetAppLockHash("some-hash")

	svc := NewLockService(f, servers, snippets, sessions, logs, settingsRepo)
	if err := svc.ResetAll(); err != nil {
		t.Fatalf("ResetAll: %v", err)
	}

	if list, _ := servers.List(); len(list) != 0 {
		t.Errorf("servers after reset = %d, want 0", len(list))
	}
	if _, err := f.GetPassword(srv.ID); err != secret.ErrNotStored {
		t.Errorf("server secret after reset = %v, want ErrNotStored", err)
	}
	if svc.HasPin() {
		t.Error("HasPin true after ResetAll")
	}
	got, _ := settingsRepo.Get()
	if got.LockEnabled {
		t.Error("settings not reset to default (LockEnabled still true)")
	}
}
