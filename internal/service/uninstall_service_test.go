package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

func TestUninstallClearsSecretsLoginAndData(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "u.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	repo := store.NewServerRepo(db)
	_ = repo.Create(sample("s1", "a", "Prod"))
	_ = repo.Create(sample("s2", "b", "Prod"))
	sec := secret.NewFake()
	_ = sec.SetPassword("s1", "pw1")
	_ = sec.SetPassword("s2", "pw2")
	login := &fakeLoginAgent{}
	dataDir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dataDir, "sshmgr.db"), []byte("x"), 0o644)
	logDir := t.TempDir()

	svc := NewUninstallService(repo, sec, login, dataDir, logDir)
	called := 0
	SetOnUninstalled(svc, func() { called++ })

	if err := svc.Uninstall(); err != nil {
		t.Fatalf("Uninstall error = %v", err)
	}
	if _, err := sec.GetPassword("s1"); !errors.Is(err, secret.ErrNotStored) {
		t.Error("s1 keychain secret was not deleted")
	}
	if _, err := sec.GetPassword("s2"); !errors.Is(err, secret.ErrNotStored) {
		t.Error("s2 keychain secret was not deleted")
	}
	if len(login.calls) == 0 || login.calls[len(login.calls)-1] {
		t.Error("login.Set(false) was not called (start-at-login not removed)")
	}
	if _, err := os.Stat(dataDir); !os.IsNotExist(err) {
		t.Error("data dir was not removed")
	}
	// MoveAppBundleToTrash is a no-op for the test binary → success → quit fires.
	if called != 1 {
		t.Errorf("onUninstalled calls = %d, want 1", called)
	}
}
