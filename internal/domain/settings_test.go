package domain

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSettingsLockDefaults(t *testing.T) {
	d := DefaultSettings()
	if d.LockEnabled {
		t.Errorf("LockEnabled default = true, want false")
	}
	if !d.LockUseBiometrics {
		t.Errorf("LockUseBiometrics default = false, want true")
	}
	if !d.LockIdleEnabled {
		t.Errorf("LockIdleEnabled default = false, want true")
	}
	if d.LockIdleMinutes != 10 {
		t.Errorf("LockIdleMinutes default = %d, want 10", d.LockIdleMinutes)
	}
}

func TestSettingsSanitiseLockIdle(t *testing.T) {
	for _, in := range []int{0, -5, 121, 9999} {
		s := Settings{LockIdleMinutes: in}
		s.Sanitise()
		if s.LockIdleMinutes != 10 {
			t.Errorf("Sanitise(%d) LockIdleMinutes = %d, want 10", in, s.LockIdleMinutes)
		}
	}
	for _, in := range []int{1, 10, 120} {
		s := Settings{LockIdleMinutes: in}
		s.Sanitise()
		if s.LockIdleMinutes != in {
			t.Errorf("Sanitise(%d) LockIdleMinutes = %d, want %d", in, s.LockIdleMinutes, in)
		}
	}
}

func TestSettingsSanitiseConnectTimeout(t *testing.T) {
	for _, in := range []int{0, -1, 121} {
		s := Settings{ConnectTimeoutSecs: in}
		s.Sanitise()
		if s.ConnectTimeoutSecs != 10 {
			t.Errorf("Sanitise(%d) ConnectTimeoutSecs = %d, want 10", in, s.ConnectTimeoutSecs)
		}
	}
}

func TestSettingsLaunchDefaults(t *testing.T) {
	d := DefaultSettings()
	if d.Terminal != TerminalApple || !d.AutoFillSecrets || !d.KeepAlive || d.TerminalOpenInTab || d.TerminalCustomCommand != "" {
		t.Fatalf("launch defaults = %+v", d)
	}
}

func TestSettingsSanitiseTerminal(t *testing.T) {
	for _, id := range TerminalIDs {
		s := Settings{Terminal: id}
		s.Sanitise()
		if s.Terminal != id {
			t.Errorf("Sanitise kept %q as %q", id, s.Terminal)
		}
	}
	for _, id := range []string{"", "warp", "Terminal", "iterm2 ", "x;y"} {
		s := Settings{Terminal: id}
		s.Sanitise()
		if s.Terminal != TerminalApple {
			t.Errorf("Sanitise(%q) Terminal = %q, want terminal", id, s.Terminal)
		}
	}
}

func TestSettingsSanitiseCustomCommand(t *testing.T) {
	cases := map[string]string{
		"  open -na MyTerm --args -e {script}  ": "open -na MyTerm --args -e {script}",
		"term -e {script}\nrm -rf ~":             "",
		"term\t-e {script}":                      "",
		"term -e {script}\x7f":                   "",
		"term -e\u0085{script}":                  "",
		"\xff\xfe {script}":                      "",
		"ターミナル -e {script}":                      "ターミナル -e {script}",
	}
	for in, want := range cases {
		s := Settings{TerminalCustomCommand: in}
		s.Sanitise()
		if s.TerminalCustomCommand != want {
			t.Errorf("Sanitise(%q) = %q, want %q", in, s.TerminalCustomCommand, want)
		}
	}
}

func TestSettingsSanitiseCustomCommandCap(t *testing.T) {
	long := strings.Repeat("é", MaxCustomCommandBytes) // 2 bytes each
	s := Settings{TerminalCustomCommand: long}
	s.Sanitise()
	if len(s.TerminalCustomCommand) > MaxCustomCommandBytes || !utf8.ValidString(s.TerminalCustomCommand) {
		t.Fatalf("capped to %d bytes, valid=%v", len(s.TerminalCustomCommand), utf8.ValidString(s.TerminalCustomCommand))
	}
	if len(s.TerminalCustomCommand) != MaxCustomCommandBytes {
		t.Fatalf("cap = %d bytes, want %d", len(s.TerminalCustomCommand), MaxCustomCommandBytes)
	}
}
