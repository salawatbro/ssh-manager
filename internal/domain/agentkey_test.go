package domain

import (
	"strings"
	"testing"
)

func TestAgentKeyValidate(t *testing.T) {
	cases := []struct {
		name    string
		key     AgentKey
		wantErr string
	}{
		{"ok", AgentKey{Name: "  work  ", Comment: " me@zish "}, ""},
		{"empty name", AgentKey{Name: "   "}, "Key name must be 1 to 64"},
		{"long name", AgentKey{Name: strings.Repeat("ы", 65)}, "Key name must be 1 to 64"},
		{"64 runes ok", AgentKey{Name: strings.Repeat("ы", 64)}, ""},
		{"control in name", AgentKey{Name: "a\tb"}, "control characters"},
		{"C1 in name", AgentKey{Name: "a\u0085b"}, "control characters"},
		{"newline in comment", AgentKey{Name: "k", Comment: "x\ncommand=\"rm\" ssh-ed25519"}, "control characters"},
		{"long comment", AgentKey{Name: "k", Comment: strings.Repeat("c", 257)}, "at most 256"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			k := c.key
			err := k.Validate()
			if c.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() = %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("Validate() = %v, want %q", err, c.wantErr)
			}
			var de *Error
			if !asDomainError(err, &de) || de.Code != CodeValidation {
				t.Fatalf("not a validation error: %v", err)
			}
		})
	}
	k := AgentKey{Name: "  work  ", Comment: " me@zish "}
	_ = k.Validate()
	if k.Name != "work" || k.Comment != "me@zish" {
		t.Fatalf("not trimmed: %+v", k)
	}
}

func TestValidateZishKeyNeedsAgentKeyID(t *testing.T) {
	s := valid()
	s.AuthType = AuthZishKey
	if err := s.Validate(); err == nil || !strings.Contains(err.Error(), "Zish key") {
		t.Fatalf("missing key id: %v", err)
	}
	blank := "  "
	s.AgentKeyID = &blank
	if err := s.Validate(); err == nil {
		t.Fatal("blank key id accepted")
	}
	id := "k1"
	s.AgentKeyID = &id
	if err := s.Validate(); err != nil {
		t.Fatalf("Validate() = %v", err)
	}
}

func TestSettingsAgentEnabledByDefault(t *testing.T) {
	if !DefaultSettings().AgentEnabled {
		t.Fatal("AgentEnabled default = false, want true")
	}
}
