package service

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

func TestSettingsLauncherHotkey(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	stacks := store.NewStackRepo(db)
	if err := stacks.Create(&domain.Stack{ID: "s1", Name: "Deploy api", Shortcut: "alt+cmd+l"}); err != nil {
		t.Fatal(err)
	}
	svc := NewSettingsService(store.NewSettingsRepo(db), nil)
	SetSettingsStacks(svc, stacks)
	cur, err := svc.Get()
	if err != nil || cur.LauncherHotkey != "alt+space" {
		t.Fatalf("Get = %+v, %v", cur, err)
	}

	in := *cur
	in.LauncherHotkey = "Space+Cmd"
	got, err := svc.Update(in)
	if err != nil || got.LauncherHotkey != "cmd+space" {
		t.Fatalf("Update(Space+Cmd) = %+v, %v", got, err)
	}

	in.LauncherHotkey = "space"
	if _, err := svc.Update(in); err == nil {
		t.Fatal("a bare Space was accepted")
	}
	in.LauncherHotkey = "cmd+alt+l"
	if _, err := svc.Update(in); err == nil || !strings.Contains(err.Error(), "⌥⌘L already launches Deploy api") {
		t.Fatalf("a stack's shortcut: %v", err)
	}
	if s, _ := svc.Get(); s.LauncherHotkey != "cmd+space" {
		t.Fatalf("a refused update was stored: %q", s.LauncherHotkey)
	}

	in.LauncherHotkey = ""
	if got, err := svc.Update(in); err != nil || got.LauncherHotkey != "" {
		t.Fatalf("turning it off = %+v, %v", got, err)
	}
	if s, _ := svc.Get(); s.LauncherHotkey != "" {
		t.Fatalf("off did not survive a save: %q", s.LauncherHotkey)
	}
}

// A clash that came in some other way (an import) must not block saving
// every other setting.
func TestSettingsUnchangedLauncherClashStillSaves(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewSettingsRepo(db)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	s.LauncherHotkey = "alt+cmd+l"
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	stacks := store.NewStackRepo(db)
	if err := stacks.Create(&domain.Stack{ID: "s1", Name: "Deploy api", Shortcut: "alt+cmd+l"}); err != nil {
		t.Fatal(err)
	}
	svc := NewSettingsService(repo, nil)
	SetSettingsStacks(svc, stacks)
	in := *s
	in.ConfirmOnQuit = false
	if _, err := svc.Update(in); err != nil {
		t.Fatalf("Update with an unchanged clash: %v", err)
	}
}

func TestStackRefusesTheLauncherShortcut(t *testing.T) {
	f := newStackFixture(t)
	db, err := store.Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	settings := store.NewSettingsRepo(db)
	s, err := settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	s.LauncherHotkey = "alt+cmd+1"
	if err := settings.Save(s); err != nil {
		t.Fatal(err)
	}
	SetStackSettings(f.svc, settings)
	if _, err := f.svc.Create(deployInput()); err == nil || !strings.Contains(err.Error(), "⌥⌘1 opens the launcher") {
		t.Fatalf("Create with the launcher's shortcut: %v", err)
	}
	in := deployInput()
	in.Shortcut = "alt+cmd+2"
	if _, err := f.svc.Create(in); err != nil {
		t.Fatalf("Create with a free shortcut: %v", err)
	}
}

func TestShortcutLabelSpace(t *testing.T) {
	if got := ShortcutLabel("alt+space"); got != "⌥Space" {
		t.Fatalf("ShortcutLabel(alt+space) = %q", got)
	}
}

func TestOpenInTabForcesATab(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	f.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalITerm2; s.TerminalOpenInTab = false })
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent})
	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.OpenInTab(s.ID); err != nil {
		t.Fatal(err)
	}
	if len(f.runner.runs) != 2 || f.runner.runs[0][4] != "window" || f.runner.runs[1][4] != "tab" {
		t.Fatalf("runs = %q", f.runner.runs)
	}
	if set, _ := f.settings.Get(); set.TerminalOpenInTab {
		t.Fatal("OpenInTab changed the stored setting")
	}
}
