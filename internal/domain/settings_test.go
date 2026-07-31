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

func TestSettingsLockDefaults(t *testing.T) {
	d := DefaultSettings()
	if d.LockEnabled {
		t.Errorf("LockEnabled default = true, want false")
	}
	if !d.LockUseBiometrics {
		t.Errorf("LockUseBiometrics default = false, want true")
	}
	if !d.LockIdleEnabled {
		t.Errorf("LockIdleEnabled default = false, want true")
	}
	if d.LockIdleMinutes != 10 {
		t.Errorf("LockIdleMinutes default = %d, want 10", d.LockIdleMinutes)
	}
}

func TestSettingsSanitiseLockIdle(t *testing.T) {
	for _, in := range []int{0, -5, 121, 9999} {
		s := Settings{LockIdleMinutes: in}
		s.Sanitise()
		if s.LockIdleMinutes != 10 {
			t.Errorf("Sanitise(%d) LockIdleMinutes = %d, want 10", in, s.LockIdleMinutes)
		}
	}
	for _, in := range []int{1, 10, 120} {
		s := Settings{LockIdleMinutes: in}
		s.Sanitise()
		if s.LockIdleMinutes != in {
			t.Errorf("Sanitise(%d) LockIdleMinutes = %d, want %d", in, s.LockIdleMinutes, in)
		}
	}
}

func TestSettingsTerminalMode(t *testing.T) {
	if d := DefaultSettings(); d.TerminalMode != "classic" {
		t.Errorf("TerminalMode default = %q, want classic", d.TerminalMode)
	}
	for _, in := range []string{"", "weird", "BLOCKS"} {
		s := Settings{TerminalMode: in}
		s.Sanitise()
		if s.TerminalMode != "classic" {
			t.Errorf("Sanitise(%q) TerminalMode = %q, want classic", in, s.TerminalMode)
		}
	}
	for _, in := range []string{"classic", "blocks"} {
		s := Settings{TerminalMode: in}
		s.Sanitise()
		if s.TerminalMode != in {
			t.Errorf("Sanitise(%q) TerminalMode = %q, want %q", in, s.TerminalMode, in)
		}
	}
}

// TestDefaultLocalGuardPatternsCatchCatastrophicNotEveryday documents the
// behavioural split the local list exists for: it fires on commands that
// would wreck the machine — including the macOS-specific disk destroyers
// (diskutil, newfs_, /dev/disk*, /dev/rdisk*) this app actually ships against
// — but stays quiet on everyday relative-path deletes. (Renamed from
// "...AreNarrowerThanProd": this test never referenced defaultGuardPatterns,
// it asserts this behaviour directly.)
func TestDefaultLocalGuardPatternsCatchCatastrophicNotEveryday(t *testing.T) {
	local := SplitPatterns(DefaultSettings().GuardPatternsLocal)
	if len(local) == 0 {
		t.Fatal("GuardPatternsLocal default is empty")
	}
	catastrophic := []string{
		"rm -rf /",
		"rm -rf ~",
		"mkfs.ext4 /dev/disk2",
		"sudo dd if=ubuntu.iso of=/dev/disk2 bs=1m",
		"sudo dd if=/dev/zero of=/dev/rdisk0",
		"sudo cat image.iso > /dev/disk2",
		"sudo diskutil eraseDisk JHFS+ Untitled disk2",
		"sudo diskutil apfs deleteContainer disk2s2",
		"sudo newfs_hfs /dev/disk2",
		"rm -rf --no-preserve-root /",
		":(){ :|:& };:",
	}
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

// TestDefaultLocalGuardPatternsAbsolutePathFalsePositive locks in a known,
// accepted limitation instead of leaving it for a confused user to discover:
// substring matching cannot tell "rm -rf /" from "rm -rf /some/path" or
// "rm -rf ~/some/path", so the two anchors also fire on absolute- and
// ~-relative recursive deletes that are not actually wiping the machine. This
// is the documented trade-off in the GuardPatternsLocal doc comment, not a
// bug — if this test starts failing, the anchors changed and the trade-off
// needs revisiting, not "fixing" by narrowing the match.
func TestDefaultLocalGuardPatternsAbsolutePathFalsePositive(t *testing.T) {
	local := SplitPatterns(DefaultSettings().GuardPatternsLocal)
	falsePositive := "rm -rf ~/Library/Caches/pip"
	if !MatchesDangerous(falsePositive, local) {
		t.Errorf("expected accepted false positive %q to match the rm -rf ~ anchor", falsePositive)
	}
}

// TestDefaultLocalGuardPatternsEachEntryNecessary is a mutation sweep: for
// every pattern in the shipped default list, there is a command that matches
// the full list but stops matching once that one pattern is removed. This
// pins each entry to a command it alone accounts for, so no entry can be
// deleted without a test noticing (a reviewer found two that previously
// could be).
func TestDefaultLocalGuardPatternsEachEntryNecessary(t *testing.T) {
	local := SplitPatterns(DefaultSettings().GuardPatternsLocal)

	// One command per pattern, chosen so it does not incidentally match any
	// *other* pattern in the list — otherwise removing the pattern under test
	// wouldn't actually stop the match, and the sweep would prove nothing.
	coverage := map[string]string{
		"rm -rf /":             "rm -rf /",
		"rm -rf ~":             "rm -rf ~",
		"mkfs":                 "mkfs.ext4 /dev/disk2",
		"of=/dev/":             "sudo dd if=ubuntu.iso of=/dev/disk2 bs=1m",
		"> /dev/disk":          "sudo cat image.iso > /dev/disk2",
		"> /dev/rdisk":         "sudo cat image.iso > /dev/rdisk0",
		"diskutil erase":       "sudo diskutil eraseDisk JHFS+ Untitled disk2",
		"diskutil apfs delete": "sudo diskutil apfs deleteContainer disk2s2",
		"newfs_":               "sudo newfs_hfs /dev/disk2",
		"--no-preserve-root":   "rm -rf --no-preserve-root /",
		":(){ :|:& };:":        ":(){ :|:& };:",
	}
	if len(coverage) != len(local) {
		t.Fatalf("mutation sweep covers %d patterns, default list has %d — update coverage when the list changes", len(coverage), len(local))
	}

	for _, pattern := range local {
		cmd, ok := coverage[pattern]
		if !ok {
			t.Fatalf("pattern %q has no covering command in the mutation sweep", pattern)
		}
		if !MatchesDangerous(cmd, local) {
			t.Fatalf("coverage command %q does not even match the full list — fix the test", cmd)
		}
		remaining := make([]string, 0, len(local)-1)
		for _, p := range local {
			if p != pattern {
				remaining = append(remaining, p)
			}
		}
		if MatchesDangerous(cmd, remaining) {
			t.Errorf("command %q for pattern %q still matches with that pattern removed — deleting %q would go unnoticed", cmd, pattern, pattern)
		}
	}
}
