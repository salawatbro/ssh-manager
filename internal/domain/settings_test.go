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

// The local list is deliberately NARROWER than the production one: `rm -rf` as
// a bare substring is a daily command on a dev machine, and a guard that fires
// constantly is a guard the user switches off — taking the production barrier
// with it.
func TestDefaultLocalGuardPatternsAreNarrowerThanProd(t *testing.T) {
	local := SplitPatterns(DefaultSettings().GuardPatternsLocal)
	if len(local) == 0 {
		t.Fatal("GuardPatternsLocal default is empty")
	}
	catastrophic := []string{"rm -rf /", "rm -rf ~", "mkfs.ext4 /dev/disk2", "dd of=/dev/disk2"}
	for _, c := range catastrophic {
		if !MatchesDangerous(c, local) {
			t.Errorf("expected %q to match a local pattern", c)
		}
	}
	everyday := []string{"rm -rf node_modules", "rm -rf ./dist", "git clean -fdx", "ls -la"}
	for _, c := range everyday {
		if MatchesDangerous(c, local) {
			t.Errorf("expected %q NOT to match a local pattern", c)
		}
	}
}
