//go:build !darwin

package platform

import (
	"os/exec"
	"runtime"
)

// RevealInFileManager opens path in the OS file manager.
//
// G204 flags exec.Command with a variable argument, but there is no shell
// here to inject into: exec.Command execs "explorer"/"xdg-open" directly
// with path as a single argv element, never interpreted by a shell. The
// one production caller (dataops_main.go's RevealDataFolder) always passes
// platform.DataDir(), the app's own fixed data folder — never attacker- or
// even user-supplied input.
func RevealInFileManager(path string) error {
	if runtime.GOOS == "windows" {
		return exec.Command("explorer", path).Start() //nolint:gosec // see above
	}
	return exec.Command("xdg-open", path).Start() //nolint:gosec // see above
}
