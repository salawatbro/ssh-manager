//go:build darwin

package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// MoveAppBundleToTrash moves the running .app bundle to the Trash via Finder
// (osascript — no cgo). It is a no-op (returns nil) when the executable is NOT
// inside a .app bundle, e.g. the `wails3 dev` binary or a test binary, so
// development never trashes anything. macOS keeps a running app's mmap'd image
// alive after its bundle is removed, so trashing while running is safe; the
// caller quits immediately after.
func MoveAppBundleToTrash() error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot resolve the executable path: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	// A packaged app runs from <Name>.app/Contents/MacOS/<bin>.
	const marker = ".app/Contents/MacOS/"
	i := strings.Index(exe, marker)
	if i < 0 {
		return nil // not a bundle (dev / test) — nothing to trash
	}
	bundle := exe[:i+len(".app")]
	script := fmt.Sprintf(`tell application "Finder" to move (POSIX file %q) to trash`, bundle)
	if err := exec.Command("osascript", "-e", script).Run(); err != nil { //nolint:gosec // G204: bundle path derived from os.Executable, not user input
		return fmt.Errorf("cannot move %s to the Trash: %w", bundle, err)
	}
	return nil
}
