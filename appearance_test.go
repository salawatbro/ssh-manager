package main

import (
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestThemeAppearance(t *testing.T) {
	cases := []struct {
		theme      string
		appearance int
		dark       [2]bool // on a light Mac, on a dark Mac
	}{
		{domain.ThemeNight, appearanceDark, [2]bool{true, true}},
		{domain.ThemeDay, appearanceLight, [2]bool{false, false}},
		{domain.ThemeAuto, appearanceSystem, [2]bool{false, true}},
		{"", appearanceDark, [2]bool{true, true}},
	}
	for _, c := range cases {
		if got := appearanceFor(c.theme); got != c.appearance {
			t.Errorf("appearanceFor(%q) = %d, want %d", c.theme, got, c.appearance)
		}
		for i, system := range []bool{false, true} {
			if got := themeIsDark(c.theme, system); got != c.dark[i] {
				t.Errorf("themeIsDark(%q, %v) = %v", c.theme, system, got)
			}
		}
	}
}

func TestWindowColourMatchesTokens(t *testing.T) {
	if c := windowColour(true); c != application.NewRGB(0x0c, 0x0d, 0x10) {
		t.Errorf("night colour = %v", c)
	}
	if c := windowColour(false); c != application.NewRGB(0xf6, 0xf6, 0xf8) {
		t.Errorf("day colour = %v", c)
	}
}
