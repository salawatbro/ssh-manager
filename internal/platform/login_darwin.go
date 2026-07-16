//go:build darwin

package platform

import (
	"fmt"
	"os"
	"path/filepath"
)

// LoginAgent registers the app as a per-user login item on macOS by writing a
// LaunchAgent plist. File-based (no cgo, no admin); RunAtLoad launches the app
// at login. The plist points at the current executable — for the packaged app
// that is SSH Manager.app/Contents/MacOS/sshmgr; in dev it is the dev binary,
// which is fine for testing.
type LoginAgent struct{}

// NewLoginAgent returns the macOS login agent.
func NewLoginAgent() *LoginAgent { return &LoginAgent{} }

const launchAgentTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>uz.salawat.sshmgr</string>
	<key>ProgramArguments</key><array><string>%s</string></array>
	<key>RunAtLoad</key><true/>
</dict>
</plist>
`

// Set writes (enabled) or removes (disabled) the LaunchAgent plist. Removing an
// already-absent plist is a no-op, not an error.
func (a *LoginAgent) Set(enabled bool) error {
	p, err := LaunchAgentPath()
	if err != nil {
		return err
	}
	if !enabled {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("cannot remove the login item %s; check that you own it: %w", p, err)
		}
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot resolve the app path for the login item: %w", err)
	}
	// 0755/0644, not the tighter modes gosec wants (G301/G306): ~/Library/
	// LaunchAgents and the plist inside it hold no secret — only the path to
	// this app's own executable, already visible via ps/Activity Monitor —
	// and macOS's own launchd examples ship agents world-readable. Matching
	// that convention, not loosening it, is the deliberate choice here.
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil { //nolint:gosec // see above
		return fmt.Errorf("cannot create the LaunchAgents folder: %w", err)
	}
	content := fmt.Sprintf(launchAgentTemplate, exe)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil { //nolint:gosec // see above
		return fmt.Errorf("cannot write the login item %s: %w", p, err)
	}
	return nil
}

// Enabled reports whether the LaunchAgent plist is present.
func (a *LoginAgent) Enabled() bool {
	p, err := LaunchAgentPath()
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}
