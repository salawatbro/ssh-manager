//go:build darwin

package platform

import "os/exec"

// OpenExternalURL opens an http/https URL in the user's default browser (macOS
// `open`). The URL originates from terminal output (untrusted), so validateURL
// (openurl.go) restricts the scheme to http/https BEFORE it reaches `open` —
// `open` would otherwise happily launch file:// paths, apps, or other URL
// schemes. exec.Command runs `open` directly (no shell), so there is no
// shell-injection surface; the scheme check is the real guard.
func OpenExternalURL(raw string) error {
	if err := validateURL(raw); err != nil {
		return err
	}
	return exec.Command("open", raw).Start() //nolint:gosec // scheme-validated http/https, no shell
}
