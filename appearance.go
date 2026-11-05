package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/domain"
)

// The appearance NSApp takes for a theme: every window, panel, menu and
// dialog inherits it, and each webview's prefers-color-scheme follows it.
const (
	appearanceSystem = iota
	appearanceDark
	appearanceLight
)

func appearanceFor(theme string) int {
	switch theme {
	case domain.ThemeDay:
		return appearanceLight
	case domain.ThemeAuto:
		return appearanceSystem
	default:
		return appearanceDark
	}
}

// themeIsDark reports whether theme draws the Night palette; Match macOS
// follows the system.
func themeIsDark(theme string, systemDark bool) bool {
	switch appearanceFor(theme) {
	case appearanceLight:
		return false
	case appearanceSystem:
		return systemDark
	default:
		return true
	}
}

// windowColours are tokens.css `bg` (the main window) and `s1` (the launcher
// and approval panels): a window shows this colour until its page paints, and
// the fullscreen title band is painted with it.
func windowColours(dark bool) (main, panel application.RGBA) {
	if dark {
		return application.NewRGB(0x0c, 0x0d, 0x10), application.NewRGB(0x15, 0x17, 0x1c)
	}
	return application.NewRGB(0xf6, 0xf6, 0xf8), application.NewRGB(0xff, 0xff, 0xff)
}
