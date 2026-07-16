//go:build !darwin

package platform

// LoginAgent is a no-op off macOS (Windows start-at-login is a follow-up —
// docs/v0.6-notes.md). Set stores nothing; Enabled is always false.
type LoginAgent struct{}

// NewLoginAgent returns the no-op login agent.
func NewLoginAgent() *LoginAgent { return &LoginAgent{} }

// Set does nothing off macOS.
func (a *LoginAgent) Set(enabled bool) error { return nil }

// Enabled is always false off macOS.
func (a *LoginAgent) Enabled() bool { return false }
