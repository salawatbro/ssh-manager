package domain

import "testing"

func TestDefaultSettingsGuard(t *testing.T) {
	s := DefaultSettings()
	if !s.GuardEnabled {
		t.Error("GuardEnabled = false, want true")
	}
	if s.GuardPatterns == "" {
		t.Error("GuardPatterns = \"\", want non-empty")
	}
}

func TestDefaultShellIntegrationOn(t *testing.T) {
	if !DefaultSettings().ShellIntegration {
		t.Error("ShellIntegration default = false, want true")
	}
}
