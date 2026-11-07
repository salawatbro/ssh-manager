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
	in.LockIdleMinutes = 0
	out, err := svc.Update(in)
	if err != nil {
		t.Fatal(err)
	}
	if out.ConnectTimeoutSecs != 10 || out.LockIdleMinutes != 10 {
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

func TestSettingsServiceUpdatePersistsTourSeen(t *testing.T) {
	svc := newSettingsService(t)
	cur, err := svc.Get()
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if cur.TourSeen {
		t.Fatal("TourSeen should default to false on a fresh settings row")
	}
	cur.TourSeen = true
	if _, err := svc.Update(*cur); err != nil {
		t.Fatalf("Update error = %v", err)
	}
	got, err := svc.Get()
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if !got.TourSeen {
		t.Fatal("TourSeen was not persisted by Update")
	}
}

// A fresh install hands back the Phase 8 defaults, and Update repairs an
// unknown choice instead of storing it.
func TestSettingsServiceAppearanceDefaultsAndRepair(t *testing.T) {
	svc := newSettingsService(t)
	s, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if s.Theme != domain.ThemeNight || s.IconStyle != domain.IconStyleIcon || !s.TunnelsKeepWhileLocked || !s.LockOnSleep {
		t.Fatalf("fresh settings = %+v", s)
	}
	in := *s
	in.Theme, in.Density, in.ColorBy, in.OpenAgain = "sepia", "tiny", "rainbow", "maybe"
	in.TunnelsKeepWhileLocked, in.LockOnSleep = false, false
	out, err := svc.Update(in)
	if err != nil {
		t.Fatal(err)
	}
	if out.Theme != domain.ThemeNight || out.Density != domain.DensityComfortable ||
		out.ColorBy != domain.ColorByGroup || out.OpenAgain != domain.OpenAgainAsk {
		t.Fatalf("not repaired: %+v", out)
	}
	got, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.TunnelsKeepWhileLocked || got.LockOnSleep {
		t.Fatalf("switches off did not persist: %+v", got)
	}
}
