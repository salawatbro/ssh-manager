package domain

import (
	"strings"
	"testing"
)

// valid returns a Server that passes validation, so each case can break
// exactly one field.
func valid() Server {
	return Server{
		Name:        "cbs-app-01",
		Host:        "10.0.1.20",
		Port:        2222,
		User:        "deploy",
		AuthType:    AuthAgent,
		Environment: EnvProd,
	}
}

func TestValidateAcceptsAValidServer(t *testing.T) {
	s := valid()
	if err := s.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want nil", err)
	}
}

func TestValidateRejects(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Server)
		wantMsg string
	}{
		{"empty name", func(s *Server) { s.Name = "" }, "Name must be"},
		{"blank name", func(s *Server) { s.Name = "   " }, "Name must be"},
		{"name over 64", func(s *Server) { s.Name = strings.Repeat("a", 65) }, "Name must be"},
		{"name at 65 runes in cyrillic", func(s *Server) { s.Name = strings.Repeat("ы", 65) }, "Name must be"},
		{"empty host", func(s *Server) { s.Host = "" }, "Host must be"},
		{"host with space", func(s *Server) { s.Host = "bad host" }, "Host must be"},
		{"host with scheme", func(s *Server) { s.Host = "ssh://x.uz" }, "Host must be"},
		{"host over 253 chars", func(s *Server) {
			s.Host = strings.Repeat("a", 60) + "." + strings.Repeat("b", 60) + "." +
				strings.Repeat("c", 60) + "." + strings.Repeat("d", 60) + "." + strings.Repeat("e", 12)
		}, "Host must be"},
		{"malformed ipv4 with octet over 255", func(s *Server) { s.Host = "10.0.1.256" }, "Host must be"},
		{"all-numeric nonsense host", func(s *Server) { s.Host = "999.999.999.999" }, "Host must be"},
		{"port zero", func(s *Server) { s.Port = 0 }, "Port must be"},
		{"port negative", func(s *Server) { s.Port = -1 }, "Port must be"},
		{"port over 65535", func(s *Server) { s.Port = 65536 }, "Port must be"},
		{"empty user", func(s *Server) { s.User = "" }, "User must be"},
		{"user over 32", func(s *Server) { s.User = strings.Repeat("u", 33) }, "User must be"},
		{"user at 33 runes in cyrillic", func(s *Server) { s.User = strings.Repeat("ы", 33) }, "User must be"},
		{"user is an ssh option flag", func(s *Server) { s.User = "-oProxyCommand=touch /tmp/pwned" }, "must not start with a hyphen"},
		{"user is a short option flag", func(s *Server) { s.User = "-l" }, "must not start with a hyphen"},
		{"unknown auth type", func(s *Server) { s.AuthType = AuthType("magic") }, "Auth method must be"},
		{"key auth without key path", func(s *Server) {
			s.AuthType = AuthKey
			s.KeyPath = ""
		}, "Key file is required"},
		{"unknown environment", func(s *Server) { s.Environment = Environment("prd") }, "Environment must be"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := valid()
			tt.mutate(&s)
			err := s.Validate()
			if err == nil {
				t.Fatalf("Validate() = nil, want an error")
			}
			var de *Error
			if !asDomainError(err, &de) {
				t.Fatalf("Validate() = %T, want *domain.Error", err)
			}
			if de.Code != CodeValidation {
				t.Errorf("code = %q, want %q", de.Code, CodeValidation)
			}
			if !strings.Contains(de.Message, tt.wantMsg) {
				t.Errorf("message = %q, want it to contain %q", de.Message, tt.wantMsg)
			}
		})
	}
}

func TestValidateAccepts(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Server)
	}{
		{"ipv6 host", func(s *Server) { s.Host = "2001:db8::1" }},
		{"hostname", func(s *Server) { s.Host = "db.example.uz" }},
		{"single label host", func(s *Server) { s.Host = "bastion" }},
		{"host with hyphen", func(s *Server) { s.Host = "cbs-db-01.internal" }},
		{"port 1", func(s *Server) { s.Port = 1 }},
		{"port 65535", func(s *Server) { s.Port = 65535 }},
		{"name at 64", func(s *Server) { s.Name = strings.Repeat("a", 64) }},
		{"name at 64 runes in cyrillic", func(s *Server) { s.Name = strings.Repeat("ы", 64) }},
		{"name at 64 runes in emoji", func(s *Server) { s.Name = strings.Repeat("🔒", 64) }},
		{"user at 32", func(s *Server) { s.User = strings.Repeat("u", 32) }},
		{"user at 32 runes in cyrillic", func(s *Server) { s.User = strings.Repeat("ы", 32) }},
		{"user with hyphen inside", func(s *Server) { s.User = "www-data" }},
		{"user with underscore", func(s *Server) { s.User = "deploy_ci" }},
		{"user with dot", func(s *Server) { s.User = "user.name" }},
		{"key auth with key path", func(s *Server) {
			s.AuthType = AuthKey
			s.KeyPath = "~/.ssh/id_ed25519"
		}},
		{"password auth", func(s *Server) { s.AuthType = AuthPassword }},
		{"environment none", func(s *Server) { s.Environment = EnvNone }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := valid()
			tt.mutate(&s)
			if err := s.Validate(); err != nil {
				t.Fatalf("Validate() = %v, want nil", err)
			}
		})
	}
}

// Validate must leave the struct holding the value it approved. Without the
// trim-in-place, Host keeps its newline, Task 4 stores it, and Task 6 pastes
// it into an ssh command — all while Validate reported the server was fine.
func TestValidateNormalizesInPlace(t *testing.T) {
	s := valid()
	s.Name = "  cbs-app-01  "
	s.Host = "\t10.0.1.20\n"
	s.User = " deploy\n"
	s.AuthType = AuthKey
	s.KeyPath = "  ~/.ssh/id_ed25519  "
	s.GroupName = "  Prod  "

	if err := s.Validate(); err != nil {
		t.Fatalf("Validate() = %v, want nil", err)
	}

	for _, tc := range []struct{ field, got, want string }{
		{"Name", s.Name, "cbs-app-01"},
		{"Host", s.Host, "10.0.1.20"},
		{"User", s.User, "deploy"},
		{"KeyPath", s.KeyPath, "~/.ssh/id_ed25519"},
		{"GroupName", s.GroupName, "Prod"},
	} {
		if tc.got != tc.want {
			t.Errorf("%s = %q after Validate, want %q", tc.field, tc.got, tc.want)
		}
	}
}

func asDomainError(err error, target **Error) bool {
	de, ok := err.(*Error)
	if ok {
		*target = de
	}
	return ok
}
