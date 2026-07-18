//go:build !darwin

package platform

// MoveAppBundleToTrash is a no-op off macOS. The app ships macOS-only; this
// keeps internal/... building under the gate's CGO_ENABLED=0 cross-checks.
func MoveAppBundleToTrash() error { return nil }

// RunningFromAppBundle is always false off macOS — there is no .app bundle
// concept, so nothing ever counts as "packaged" here.
func RunningFromAppBundle() bool { return false }
