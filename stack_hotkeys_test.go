package main

import (
	"slices"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestCarbonShortcut(t *testing.T) {
	key, mods, ok := carbonShortcut("alt+cmd+1")
	if !ok || key != 0x12 || mods != 1<<11|1<<8 {
		t.Fatalf("alt+cmd+1 = %#x %#x %v", key, mods, ok)
	}
	if key, mods, ok := carbonShortcut("ctrl+shift+cmd+k"); !ok || key != 0x28 || mods != 1<<12|1<<9|1<<8 {
		t.Fatalf("ctrl+shift+cmd+k = %#x %#x %v", key, mods, ok)
	}
	for _, bad := range []string{"", "cmd", "1", "cmd+1+2", "cmd+f5", "hyper+1"} {
		if _, _, ok := carbonShortcut(bad); ok {
			t.Errorf("carbonShortcut(%q) accepted", bad)
		}
	}
	// Every key a stack shortcut may use has a code.
	for _, c := range "abcdefghijklmnopqrstuvwxyz0123456789" {
		if _, ok := carbonKeys[string(c)]; !ok {
			t.Errorf("no key code for %q", c)
		}
	}
}

func TestStackHotkeysSync(t *testing.T) {
	registered := map[int]uint32{}
	h := &stackHotkeys{
		register: func(id int, key, _ uint32) bool {
			if key == 0x13 { // the 2 key: held by another app
				return false
			}
			registered[id] = key
			return true
		},
		unregister: func(id int) { delete(registered, id) },
	}
	step := []domain.StackStep{{Kind: domain.StepServer}}
	taken := h.sync([]domain.Stack{
		{ID: "a", Name: "A", Shortcut: "alt+cmd+1", Steps: step},
		{ID: "b", Name: "B", Shortcut: "alt+cmd+2", Steps: step},
		{ID: "c", Name: "C", Shortcut: "", Steps: step},
		{ID: "d", Name: "D", Shortcut: "alt+cmd+3"},
		{ID: "e", Name: "E", Shortcut: "alt+cmd+4", Steps: step},
	}, "")
	if !slices.Equal(taken, []string{"B"}) || len(registered) != 2 {
		t.Fatalf("taken %v, registered %v", taken, registered)
	}
	if sid, ok := h.stackFor(firstStackHotkey); !ok || sid != "a" {
		t.Fatalf("first id = %q", sid)
	}
	if sid, _ := h.stackFor(firstStackHotkey + 1); sid != "e" {
		t.Fatalf("second id = %q", sid)
	}
	if _, ok := h.stackFor(toggleHotkeyID); ok {
		t.Fatal("the window toggle id maps to a stack")
	}

	h.sync(nil, "")
	if len(registered) != 0 {
		t.Fatalf("sync(nil) left %v registered", registered)
	}
}

func TestLauncherHotkey(t *testing.T) {
	if key, mods, ok := carbonShortcut("alt+space"); !ok || key != 0x31 || mods != 1<<11 {
		t.Fatalf("alt+space = %#x %#x %v", key, mods, ok)
	}
	registered := map[int]uint32{}
	holdOthers := false
	h := &launcherHotkey{
		register: func(id int, key, _ uint32) bool {
			if holdOthers {
				return false
			}
			registered[id] = key
			return true
		},
		unregister: func(id int) { delete(registered, id) },
	}
	h.set("alt+space")
	if want, taken := h.state(); want != "alt+space" || taken || registered[launcherHotkeyID] != 0x31 {
		t.Fatalf("state %q %v, registered %v", want, taken, registered)
	}
	holdOthers = true
	h.set("alt+cmd+l")
	if want, taken := h.state(); want != "alt+cmd+l" || !taken || len(registered) != 0 {
		t.Fatalf("taken: state %q %v, registered %v", want, taken, registered)
	}
	holdOthers = false
	h.set("")
	if want, taken := h.state(); want != "" || taken || len(registered) != 0 {
		t.Fatalf("off: state %q %v, registered %v", want, taken, registered)
	}
}

// The launcher's shortcut wins over a stack that has the same one.
func TestStackHotkeysSkipTheLauncher(t *testing.T) {
	registered := map[int]bool{}
	h := &stackHotkeys{
		register:   func(id int, _, _ uint32) bool { registered[id] = true; return true },
		unregister: func(id int) { delete(registered, id) },
	}
	step := []domain.StackStep{{Kind: domain.StepServer}}
	taken := h.sync([]domain.Stack{
		{ID: "a", Name: "A", Shortcut: "alt+cmd+l", Steps: step},
		{ID: "b", Name: "B", Shortcut: "alt+cmd+2", Steps: step},
	}, "alt+cmd+l")
	if !slices.Equal(taken, []string{"A"}) || len(registered) != 1 || registered[launcherHotkeyID] {
		t.Fatalf("taken %v, registered %v", taken, registered)
	}
	if sid, _ := h.stackFor(firstStackHotkey); sid != "b" {
		t.Fatalf("first stack id = %q", sid)
	}
}

func TestHotkeyFiredDispatchesTheLauncher(t *testing.T) {
	fired := make(chan string, 2)
	prevToggle, prevLauncher := onGlobalHotkey, onLauncherHotkey
	t.Cleanup(func() { onGlobalHotkey, onLauncherHotkey = prevToggle, prevLauncher })
	onGlobalHotkey = func() { fired <- "toggle" }
	onLauncherHotkey = func() { fired <- "launcher" }
	hotkeyFired(launcherHotkeyID)
	hotkeyFired(toggleHotkeyID)
	if a, b := <-fired, <-fired; a != "launcher" || b != "toggle" {
		t.Fatalf("fired %q then %q", a, b)
	}
}
