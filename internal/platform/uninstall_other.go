//go:build !darwin

package platform

// MoveAppBundleToTrash is a no-op off macOS. The app ships macOS-only; this
// keeps internal/... building under the gate's CGO_ENABLED=0 cross-checks.
func MoveAppBundleToTrash() error { return nil }
