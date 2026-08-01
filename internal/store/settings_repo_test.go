package store

import (
	"path/filepath"
	"testing"
)

func newSettingsRepo(t *testing.T) *SettingsRepo {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	return NewSettingsRepo(db)
}

// Get on a fresh database returns the defaults (row seeded), not an error.
func TestSettingsGetSeedsDefaults(t *testing.T) {
	repo := newSettingsRepo(t)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if !s.KeepRunningInTray || s.ConnectTimeoutSecs != 10 || s.TermScrollback != 10000 {
		t.Fatalf("defaults not seeded: %+v", s)
	}
	if s.TerminalMode != "blocks" {
		t.Fatalf("fresh-install TerminalMode = %q, want blocks", s.TerminalMode)
	}
}

func TestSettingsExistingClassicChoiceSurvivesDefaultFlip(t *testing.T) {
	repo := newSettingsRepo(t)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	s.TerminalMode = "classic"
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.TerminalMode != "classic" {
		t.Fatalf("persisted TerminalMode = %q, want classic", got.TerminalMode)
	}
}

func TestSettingsSaveRoundTrips(t *testing.T) {
	repo := newSettingsRepo(t)
	s, _ := repo.Get()
	s.TermFontSize = 15
	s.ConnectTimeoutSecs = 20
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	got, _ := repo.Get()
	if got.TermFontSize != 15 || got.ConnectTimeoutSecs != 20 {
		t.Fatalf("save did not persist: %+v", got)
	}
}
