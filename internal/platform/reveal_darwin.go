//go:build darwin

package platform

import "os/exec"

// RevealInFileManager opens path in Finder (macOS).
//
// G204 flags exec.Command with a variable argument, but there is no shell
// here to inject into: exec.Command execs "open" directly with path as a
// single argv element, never interpreted by /bin/sh. The one production
// caller (dataops_main.go's RevealDataFolder) always passes
// platform.DataDir(), the app's own fixed data folder — never
// attacker- or even user-supplied input.
func RevealInFileManager(path string) error { return exec.Command("open", path).Start() } //nolint:gosec // see above
