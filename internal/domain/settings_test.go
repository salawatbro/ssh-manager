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
	for _, id := range []string{"", "hyper", "Terminal", "iterm2 ", "x;y"} {
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

func TestSettingsAppearanceAndTunnelDefaults(t *testing.T) {
	d := DefaultSettings()
	if d.Theme != ThemeNight || d.Density != DensityComfortable || d.IconStyle != IconStyleIcon ||
		d.ColorBy != ColorByGroup || !d.MenuIcons || d.OpenAgain != OpenAgainAsk {
		t.Fatalf("appearance defaults = theme %q density %q icons %q colour %q menu %v open %q",
			d.Theme, d.Density, d.IconStyle, d.ColorBy, d.MenuIcons, d.OpenAgain)
	}
	if !d.LockOnSleep || !d.TunnelsAutoStart || !d.TunnelsReconnect || !d.TunnelsKeepWhileLocked ||
		!d.TunnelsNotify || !d.TunnelsSuggestPort {
		t.Fatalf("lock/tunnel defaults = %+v", d)
	}
}

func TestSettingsSanitiseChoices(t *testing.T) {
	s := Settings{Theme: "Dusk", Density: "", IconStyle: "emoji", ColorBy: "tag", OpenAgain: "close"}
	s.Sanitise()
	if s.Theme != ThemeNight || s.Density != DensityComfortable || s.IconStyle != IconStyleIcon ||
		s.ColorBy != ColorByGroup || s.OpenAgain != OpenAgainAsk {
		t.Fatalf("Sanitise repaired to %q %q %q %q %q", s.Theme, s.Density, s.IconStyle, s.ColorBy, s.OpenAgain)
	}
	ok := Settings{Theme: ThemeAuto, Density: DensityCompact, IconStyle: IconStyleLetters, ColorBy: ColorByNone, OpenAgain: OpenAgainNew}
	ok.Sanitise()
	if ok.Theme != ThemeAuto || ok.Density != DensityCompact || ok.IconStyle != IconStyleLetters ||
		ok.ColorBy != ColorByNone || ok.OpenAgain != OpenAgainNew {
		t.Fatalf("Sanitise changed valid choices: %q %q %q %q %q", ok.Theme, ok.Density, ok.IconStyle, ok.ColorBy, ok.OpenAgain)
	}
}

func TestSettingsNewServerLook(t *testing.T) {
	cases := []struct {
		style, by, icon, color string
	}{
		{IconStyleIcon, ColorByGroup, NewServerIcon, ""},
		{IconStyleLetters, ColorByGroup, "", ""},
		{IconStyleIcon, ColorByNone, NewServerIcon, "gray"},
	}
	for _, c := range cases {
		icon, color := Settings{IconStyle: c.style, ColorBy: c.by}.NewServerLook()
		if icon != c.icon || color != c.color {
			t.Errorf("%s/%s look = %q %q, want %q %q", c.style, c.by, icon, color, c.icon, c.color)
		}
	}
}

func TestSettingsSanitiseBackupFolder(t *testing.T) {
	for in, want := range map[string]string{
		"":                        "",
		"Backups":                 "",
		"../x":                    "",
		"/Volumes/Disk/Zish/":     "/Volumes/Disk/Zish",
		"/Users/a/./Dropbox/../B": "/Users/a/B",
	} {
		s := DefaultSettings()
		s.BackupFolder = in
		s.Sanitise()
		if s.BackupFolder != want {
			t.Errorf("Sanitise(%q) = %q, want %q", in, s.BackupFolder, want)
		}
	}
}
