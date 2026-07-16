package service

import (
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestSSHCommand(t *testing.T) {
	tests := []struct {
		name string
		srv  domain.Server
		jump *domain.Server
		want string
	}{
		{
			name: "default port is omitted",
			srv:  domain.Server{Host: "10.0.1.20", Port: 22, User: "deploy"},
			want: "ssh deploy@10.0.1.20",
		},
		{
			name: "non-default port is included",
			srv:  domain.Server{Host: "10.0.1.20", Port: 2222, User: "deploy"},
			want: "ssh -p 2222 deploy@10.0.1.20",
		},
		{
			name: "key auth adds an identity file",
			srv: domain.Server{
				Host: "10.0.1.20", Port: 22, User: "deploy",
				AuthType: domain.AuthKey, KeyPath: "~/.ssh/id_ed25519",
			},
			want: "ssh -i ~/.ssh/id_ed25519 deploy@10.0.1.20",
		},
		{
			name: "jump host adds -J",
			srv:  domain.Server{Host: "10.0.2.10", Port: 22, User: "postgres"},
			jump: &domain.Server{Host: "203.0.113.7", Port: 22, User: "jump"},
			want: "ssh -J jump@203.0.113.7 postgres@10.0.2.10",
		},
		{
			name: "jump host on a non-default port",
			srv:  domain.Server{Host: "10.0.2.10", Port: 22, User: "postgres"},
			jump: &domain.Server{Host: "203.0.113.7", Port: 2200, User: "jump"},
			want: "ssh -J jump@203.0.113.7:2200 postgres@10.0.2.10",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SSHCommand(tt.srv, tt.jump); got != tt.want {
				t.Errorf("SSHCommand() = %q, want %q", got, tt.want)
			}
		})
	}
}

// SEC-07: user and host are user-supplied text. A name carrying shell
// metacharacters must not turn into a second command when pasted.
func TestSSHCommandQuotesShellMetacharacters(t *testing.T) {
	tests := []struct {
		name string
		srv  domain.Server
		must string
	}{
		{
			name: "semicolon in user",
			srv:  domain.Server{Host: "10.0.1.20", Port: 22, User: "deploy; rm -rf /"},
			must: `'deploy; rm -rf /'@10.0.1.20`,
		},
		{
			name: "backtick in key path",
			srv: domain.Server{
				Host: "10.0.1.20", Port: 22, User: "deploy",
				AuthType: domain.AuthKey, KeyPath: "~/.ssh/`whoami`",
			},
			must: "'~/.ssh/`whoami`'",
		},
		{
			name: "dollar in host",
			srv:  domain.Server{Host: "$(hostname)", Port: 22, User: "deploy"},
			must: "'$(hostname)'",
		},
		{
			name: "single quote in user",
			srv:  domain.Server{Host: "10.0.1.20", Port: 22, User: "de'ploy"},
			must: `'de'\''ploy'`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SSHCommand(tt.srv, nil)
			if !strings.Contains(got, tt.must) {
				t.Errorf("SSHCommand() = %q, want it to contain %q", got, tt.must)
			}
		})
	}
}

// TestSSHCommandQuotesJumpTarget covers the -J branch, which
// TestSSHCommandQuotesShellMetacharacters cannot reach: that table always
// calls SSHCommand(tt.srv, nil), so a jump case does not fit its shape
// without reshaping every row. A separate, focused test reads better here
// than bolting an unused jump field onto a table whose other cases would
// have to carry nil for it.
//
// SEC-07: the -J target is built as "user@host" (plus ":port" when the port
// is not 22) and then shell-quoted as a single word. Before this test, both
// existing jump cases used User: "jump" — safe input for which shellQuote is
// a no-op — so deleting shellQuote(target) from the -J branch left the whole
// suite passing. A jump User carrying a shell metacharacter is required to
// tell "quoted" apart from "not quoted".
func TestSSHCommandQuotesJumpTarget(t *testing.T) {
	srv := domain.Server{Host: "10.0.2.10", Port: 22, User: "postgres"}
	jump := &domain.Server{Host: "203.0.113.7", Port: 22, User: "j; touch /tmp/pwned; echo"}

	got := SSHCommand(srv, jump)
	// target = "j; touch /tmp/pwned; echo@203.0.113.7" (no :port suffix,
	// jump.Port is the default 22); shellQuote wraps the whole target in
	// single quotes because it contains ';' and ' ', both in shellUnsafe,
	// and there is no embedded single quote to escape.
	must := `-J 'j; touch /tmp/pwned; echo@203.0.113.7'`
	if !strings.Contains(got, must) {
		t.Errorf("SSHCommand() = %q, want it to contain %q", got, must)
	}
}

// TestSSHCommandDoesNotDefendAgainstArgvInjection documents the boundary
// between this package and internal/domain. SSHCommand is a pure renderer —
// it does not call Validate and has no way to know a value is unsafe as an
// ssh argument, only as a shell word. A User starting with '-' is correctly
// shell-quoted here (SEC-07 works exactly as intended), but quoting only
// controls the shell: once the user pastes the result and the shell strips
// the quotes, ssh's own argv parser sees a token starting with '-' and reads
// it as an option (e.g. -oProxyCommand=...), not a username. Closing that
// gap is not this package's job. domain.Server.Validate rejects a leading
// '-' in User before a value can ever reach SSHCommand, and that is the
// layer this test asserts against.
func TestSSHCommandDoesNotDefendAgainstArgvInjection(t *testing.T) {
	srv := domain.Server{
		Host: "10.0.1.20",
		Port: 22,
		User: "-oProxyCommand=touch /tmp/pwned",
	}

	// SSHCommand renders the value faithfully and shell-quotes it — that is
	// all this layer promises. The rendered string is not itself dangerous
	// to the shell; the danger is what ssh does with the token once the
	// shell hands it over unquoted.
	got := SSHCommand(srv, nil)
	want := "ssh '-oProxyCommand=touch /tmp/pwned'@10.0.1.20"
	if got != want {
		t.Fatalf("SSHCommand() = %q, want %q", got, want)
	}

	// domain is the layer that actually closes this vector: the same User
	// value must fail Validate, so it never reaches SSHCommand in the first
	// place.
	if err := srv.Validate(); err == nil {
		t.Fatalf("Validate() = nil, want an error rejecting a User starting with '-'")
	}
}

func TestShellQuoteLeavesSafeTextAlone(t *testing.T) {
	for _, s := range []string{"deploy", "10.0.1.20", "~/.ssh/id_ed25519", "db.example.uz", "cbs-app-01"} {
		if got := shellQuote(s); got != s {
			t.Errorf("shellQuote(%q) = %q, want it unchanged", s, got)
		}
	}
}

// TestShellQuoteQuotesEmptyString pins the empty-string branch: it does not
// fit TestShellQuoteLeavesSafeTextAlone's "unchanged" contract above, because
// an empty word left unquoted vanishes from the argument list entirely
// (`ssh -i  deploy@host` collapses -i's argument into the next token).
// The two-quote form is the only rendering that preserves it as an empty
// word.
func TestShellQuoteQuotesEmptyString(t *testing.T) {
	if got := shellQuote(""); got != "''" {
		t.Errorf("shellQuote(\"\") = %q, want %q", got, "''")
	}
}
