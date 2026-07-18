//go:build darwin

package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// bundleMarker is how a packaged app's binary path is recognized: a packaged
// app runs from <Name>.app/Contents/MacOS/<bin>. The `wails3 dev` binary and
// test binaries never have this in their path.
const bundleMarker = ".app/Contents/MacOS/"

// resolvedExePath returns the symlink-resolved path of the running binary.
func resolvedExePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot resolve the executable path: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return exe, nil
}

// RunningFromAppBundle reports whether the running binary lives inside a
// packaged .app bundle (as opposed to a `wails3 dev` or test binary). It is
// the SAME detection MoveAppBundleToTrash uses to decide whether there is
// anything to trash, exposed so callers can gate destructive work (data
// deletion) on it too, before ever reaching MoveAppBundleToTrash.
func RunningFromAppBundle() bool {
	exe, err := resolvedExePath()
	if err != nil {
		return false
	}
	return strings.Contains(exe, bundleMarker)
}

// MoveAppBundleToTrash moves the running .app bundle to the Trash via Finder
// (osascript — no cgo). It is a no-op (returns nil) when the executable is NOT
// inside a .app bundle, e.g. the `wails3 dev` binary or a test binary, so
// development never trashes anything. macOS keeps a running app's mmap'd image
// alive after its bundle is removed, so trashing while running is safe; the
// caller quits immediately after.
func MoveAppBundleToTrash() error {
	// Resolved here (not via RunningFromAppBundle) so an os.Executable failure
	// still surfaces as an error, exactly as before this was factored out.
	exe, err := resolvedExePath()
	if err != nil {
		return err
	}
	i := strings.Index(exe, bundleMarker)
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
