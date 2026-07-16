package service

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

func newSettingsService(t *testing.T) *SettingsService {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	return NewSettingsService(store.NewSettingsRepo(db), nil)
}

func TestSettingsServiceGetReturnsDefaults(t *testing.T) {
	svc := newSettingsService(t)
	s, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if s.ConnectTimeoutSecs != 10 {
		t.Fatalf("got %+v", s)
	}
}

// Update clamps out-of-range values (Sanitise) instead of storing nonsense.
func TestSettingsServiceUpdateSanitises(t *testing.T) {
	svc := newSettingsService(t)
	in := domain.DefaultSettings()
	in.ConnectTimeoutSecs = 9999
	in.TermFontSize = 2
	in.TermCursor = "spiral"
	out, err := svc.Update(in)
	if err != nil {
		t.Fatal(err)
	}
	if out.ConnectTimeoutSecs != 10 || out.TermFontSize != 13 || out.TermCursor != "block" {
		t.Fatalf("not sanitised: %+v", out)
	}
}

// fakeLoginAgent records Set calls and returns a canned error, so tests can
// assert the Update side-effect contract without touching the real OS.
type fakeLoginAgent struct {
	calls []bool
	err   error
}

func (f *fakeLoginAgent) Set(enabled bool) error {
	f.calls = append(f.calls, enabled)
	return f.err
}

// Update fires the login side effect exactly once, and only when
// StartAtLogin actually changed.
func TestSettingsServiceUpdateFiresLoginOnChange(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewSettingsRepo(db)
	fake := &fakeLoginAgent{}
	svc := NewSettingsService(repo, fake)

	in := domain.DefaultSettings()
	in.StartAtLogin = true
	if _, err := svc.Update(in); err != nil {
		t.Fatal(err)
	}
	if len(fake.calls) != 1 || fake.calls[0] != true {
		t.Fatalf("expected exactly one Set(true) call, got %+v", fake.calls)
	}

	// StartAtLogin unchanged (still true) — no further Set call.
	if _, err := svc.Update(in); err != nil {
		t.Fatal(err)
	}
	if len(fake.calls) != 1 {
		t.Fatalf("expected no Set call for an unchanged flag, got %+v", fake.calls)
	}
}

// Update saves the settings row even when the login agent's Set fails; the
// error is surfaced to the caller, but the row is not lost.
func TestSettingsServiceUpdatePersistsEvenIfLoginFails(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewSettingsRepo(db)
	fake := &fakeLoginAgent{err: errors.New("boom")}
	svc := NewSettingsService(repo, fake)

	in := domain.DefaultSettings()
	in.StartAtLogin = true
	if _, err := svc.Update(in); err == nil {
		t.Fatal("expected the login agent error to be surfaced")
	}
	if len(fake.calls) != 1 {
		t.Fatalf("expected exactly one Set call, got %+v", fake.calls)
	}

	got, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if !got.StartAtLogin {
		t.Fatal("settings row was not persisted despite the login-agent error")
	}
}
