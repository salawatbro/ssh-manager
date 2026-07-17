package domain

import "testing"

func TestMatchesDangerous(t *testing.T) {
	pats := SplitPatterns(DefaultSettings().GuardPatterns)
	danger := []string{"rm -rf /", "sudo rm -rf --no-preserve-root /", "dd if=/dev/zero of=/dev/sda", "shutdown now"}
	for _, c := range danger {
		if !MatchesDangerous(c, pats) {
			t.Errorf("expected %q to match a dangerous pattern", c)
		}
	}
	safe := []string{"ls -la", "git status", "rmdir empty", "cat readme"}
	for _, c := range safe {
		if MatchesDangerous(c, pats) {
			t.Errorf("expected %q NOT to match", c)
		}
	}
	if MatchesDangerous("rm -rf /", nil) {
		t.Error("no patterns → never matches")
	}
	// blank lines in the pattern set are ignored, not a match-all.
	if MatchesDangerous("anything", SplitPatterns("\n  \n")) {
		t.Error("blank patterns must not match everything")
	}
}
