package domain

import "testing"

func TestParseLauncherShortcut(t *testing.T) {
	ok := map[string]string{
		"":                "",
		"alt+space":       "alt+space",
		"Space+Alt":       "alt+space",
		"cmd+space":       "cmd+space",
		"ctrl+alt+space":  "ctrl+alt+space",
		"shift+cmd+space": "shift+cmd+space",
		"cmd+alt+l":       "alt+cmd+l",
	}
	for in, want := range ok {
		got, err := ParseLauncherShortcut(in)
		if err != nil || got != want {
			t.Errorf("ParseLauncherShortcut(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	bad := []string{
		"space",             // no modifier
		"ctrl+space",        // macOS input sources; no ⌘ or ⌥
		"shift+space",       // no ⌘ or ⌥
		"alt+l",             // a letter still needs two modifiers
		"alt+space+l",       // two keys
		"alt+alt+space",     // repeated modifier
		"shift+cmd+s",       // Zish's own toggle
		"alt+cmd+backspace", // not a key a shortcut may use
	}
	for _, in := range bad {
		if got, err := ParseLauncherShortcut(in); err == nil {
			t.Errorf("ParseLauncherShortcut(%q) = %q, want an error", in, got)
		}
	}
}

func TestSettingsSanitiseLauncherHotkey(t *testing.T) {
	if d := DefaultSettings(); d.LauncherHotkey != "alt+space" {
		t.Fatalf("default launcher hot key = %q", d.LauncherHotkey)
	}
	cases := map[string]string{
		"":            "", // off stays off
		"Space+Cmd":   "cmd+space",
		"space":       DefaultLauncherShortcut,
		"cmd+1":       DefaultLauncherShortcut,
		"shift+cmd+s": DefaultLauncherShortcut,
	}
	for in, want := range cases {
		s := Settings{LauncherHotkey: in}
		s.Sanitise()
		if s.LauncherHotkey != want {
			t.Errorf("Sanitise(%q) LauncherHotkey = %q, want %q", in, s.LauncherHotkey, want)
		}
	}
}
