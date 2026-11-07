package domain

import (
	"slices"
	"testing"
)

func TestSplitCheckIDs(t *testing.T) {
	tests := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"key-age", []string{"key-age"}},
		{" key-age , rsa-keys,key-age", []string{"key-age", "rsa-keys"}},
		{"nope,app-lock,,", []string{"app-lock"}},
	}
	for _, tt := range tests {
		if got := SplitCheckIDs(tt.in); !slices.Equal(got, tt.want) {
			t.Errorf("SplitCheckIDs(%q) = %v, want %v", tt.in, got, tt.want)
		}
	}
}

func TestJoinCheckIDsUsesReportOrder(t *testing.T) {
	if got := JoinCheckIDs([]string{CheckJumpKeys, "bogus", CheckPasswordServers}); got != "password-servers,jump-keys" {
		t.Fatalf("JoinCheckIDs = %q", got)
	}
}

func TestSettingsSanitiseSecurityFields(t *testing.T) {
	s := Settings{RotateReminderDays: 42, SecurityIgnored: "rsa-keys, made-up ,password-servers"}
	s.Sanitise()
	if s.RotateReminderDays != 365 {
		t.Errorf("RotateReminderDays = %d, want 365", s.RotateReminderDays)
	}
	if s.SecurityIgnored != "password-servers,rsa-keys" {
		t.Errorf("SecurityIgnored = %q", s.SecurityIgnored)
	}
	for _, days := range RotateReminderChoices {
		s := Settings{RotateReminderDays: days}
		s.Sanitise()
		if s.RotateReminderDays != days {
			t.Errorf("Sanitise kept %d as %d", days, s.RotateReminderDays)
		}
	}
	if d := DefaultSettings(); d.RotateReminderDays != 365 || d.SecurityIgnored != "" {
		t.Errorf("defaults = %d %q", d.RotateReminderDays, d.SecurityIgnored)
	}
}
