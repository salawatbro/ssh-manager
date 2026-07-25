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

// Get backfills GuardPatterns for an install upgraded from before the v0.7
// guard: AutoMigrate seeds new installs via DefaultSettings(), but an
// existing row on an upgraded DB keeps the empty gorm column default. Without
// a backfill, the guard would be enabled but match nothing.
func TestSettingsServiceGetBackfillsEmptyGuardPatterns(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewSettingsRepo(db)
	svc := NewSettingsService(repo, nil)

	// Simulate an upgraded install: a row exists but GuardPatterns is still
	// empty (the pre-v0.7 shape / the raw gorm column default).
	seed := domain.DefaultSettings()
	seed.GuardPatterns = ""
	if err := repo.Save(&seed); err != nil {
		t.Fatal(err)
	}

	want := domain.DefaultSettings().GuardPatterns
	got, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.GuardPatterns != want {
		t.Fatalf("expected backfilled guard patterns, got %q", got.GuardPatterns)
	}

	// Persisted: a fresh read straight from the repo (bypassing the service)
	// sees the same non-empty patterns, not just an in-memory patch.
	again, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if again.GuardPatterns != want {
		t.Fatalf("backfill was not persisted, got %q", again.GuardPatterns)
	}
}

// Get must not clobber a row that already has custom (non-empty) guard
// patterns — the backfill only applies to the empty/degenerate case.
func TestSettingsServiceGetDoesNotClobberCustomGuardPatterns(t *testing.T) {
	svc := newSettingsService(t)
	custom := "my-custom-pattern\nanother-one\n"

	in := domain.DefaultSettings()
	in.GuardPatterns = custom
	if _, err := svc.Update(in); err != nil {
		t.Fatal(err)
	}

	got, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.GuardPatterns != custom {
		t.Fatalf("custom guard patterns were clobbered: got %q", got.GuardPatterns)
	}
}

// Same backfill as GuardPatterns, added with the local terminal tab: an
// upgraded row carries "" for the new column and would guard nothing locally.
func TestSettingsServiceGetBackfillsEmptyLocalGuardPatterns(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewSettingsRepo(db)
	svc := NewSettingsService(repo, nil)

	seed := domain.DefaultSettings()
	seed.GuardPatternsLocal = ""
	if err := repo.Save(&seed); err != nil {
		t.Fatal(err)
	}

	got, err := svc.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.GuardPatternsLocal != domain.DefaultSettings().GuardPatternsLocal {
		t.Fatalf("expected backfilled local guard patterns, got %q", got.GuardPatternsLocal)
	}
	// Persisted, not just patched in memory for this call.
	again, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if again.GuardPatternsLocal == "" {
		t.Error("backfill was not saved")
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
