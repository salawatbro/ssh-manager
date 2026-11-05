//go:build !darwin

package main

import (
	"os"
	"path/filepath"

	"github.com/salawat/sshmgr/internal/launcher"
)

// pathAppLocator probes the usual Applications folders by app name; there is
// no LaunchServices off macOS.
type pathAppLocator struct{}

func newAppLocator() launcher.AppLocator { return pathAppLocator{} }

var bundleNames = map[string]string{
	"com.apple.Terminal":     "Terminal.app",
	"com.googlecode.iterm2":  "iTerm.app",
	"com.mitchellh.ghostty":  "Ghostty.app",
	"com.github.wez.wezterm": "WezTerm.app",
	"net.kovidgoyal.kitty":   "kitty.app",
	"org.alacritty":          "Alacritty.app",
	"dev.warp.Warp-Stable":   "Warp.app",
}

func (pathAppLocator) Locate(bundleID string) (launcher.AppInfo, bool) {
	name, ok := bundleNames[bundleID]
	if !ok {
		return launcher.AppInfo{}, false
	}
	home, _ := os.UserHomeDir()
	for _, dir := range []string{"/Applications", "/System/Applications/Utilities", filepath.Join(home, "Applications")} {
		p := filepath.Join(dir, name)
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			return launcher.AppInfo{Path: p}, true
		}
	}
	return launcher.AppInfo{}, false
}
