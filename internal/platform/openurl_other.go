//go:build !darwin

package platform

import (
	"os/exec"
	"runtime"
)

// OpenExternalURL opens an http/https URL in the user's default browser. See
// the darwin variant and validateURL for why the scheme is checked first.
func OpenExternalURL(raw string) error {
	if err := validateURL(raw); err != nil {
		return err
	}
	if runtime.GOOS == "windows" {
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", raw).Start() //nolint:gosec // scheme-validated
	}
	return exec.Command("xdg-open", raw).Start() //nolint:gosec // scheme-validated
}
