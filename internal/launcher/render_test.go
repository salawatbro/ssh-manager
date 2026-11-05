package launcher

import (
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func render(t *testing.T, chain ...domain.Server) string {
	t.Helper()
	got, err := RenderCommand(chain, AgentPaths{})
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestRenderCommand(t *testing.T) {
	tests := []struct {
		name  string
		chain []domain.Server
		want  string
	}{
		{"default port is omitted", []domain.Server{{Host: "10.0.1.20", Port: 22, User: "deploy"}}, "ssh deploy@10.0.1.20"},
		{"non-default port is included", []domain.Server{{Host: "10.0.1.20", Port: 2222, User: "deploy"}}, "ssh -p 2222 deploy@10.0.1.20"},
		{
			"key auth adds an identity file",
			[]domain.Server{{Host: "10.0.1.20", Port: 22, User: "deploy", AuthType: domain.AuthKey, KeyPath: "~/.ssh/id_ed25519"}},
			"ssh -i ~/.ssh/id_ed25519 deploy@10.0.1.20",
		},
		{
			"jump host adds -J",
			[]domain.Server{{Host: "203.0.113.7", Port: 22, User: "jump"}, {Host: "10.0.2.10", Port: 22, User: "postgres"}},
			"ssh -J jump@203.0.113.7 postgres@10.0.2.10",
		},
		{
			"jump host on a non-default port",
			[]domain.Server{{Host: "203.0.113.7", Port: 2200, User: "jump"}, {Host: "10.0.2.10", Port: 22, User: "postgres"}},
			"ssh -J jump@203.0.113.7:2200 postgres@10.0.2.10",
		},
		{
			"multi-hop chain, root first",
			[]domain.Server{{Host: "a.example", Port: 22, User: "u1"}, {Host: "b.example", Port: 2222, User: "u2"}, {Host: "c.example", Port: 22, User: "u3"}},
			"ssh -J u1@a.example,u2@b.example:2222 u3@c.example",
		},
		{
			"IPv6 jump is bracketed",
			[]domain.Server{{Host: "2001:db8::1", Port: 2200, User: "j"}, {Host: "fe80::2", Port: 22, User: "t"}},
			"ssh -J 'j@[2001:db8::1]:2200' t@fe80::2",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := render(t, tt.chain...); got != tt.want {
				t.Errorf("RenderCommand() = %q, want %q", got, tt.want)
			}
		})
	}
}

// User, host and key path are user input; pasted into a shell they must
// stay single words.
func TestRenderCommandQuotesShellMetacharacters(t *testing.T) {
	tests := []struct {
		name string
		srv  domain.Server
		must string
	}{
		{"semicolon in user", domain.Server{Host: "10.0.1.20", Port: 22, User: "deploy; rm -rf /"}, `'deploy; rm -rf /'@10.0.1.20`},
		{"backtick in key path", domain.Server{Host: "10.0.1.20", Port: 22, User: "deploy", AuthType: domain.AuthKey, KeyPath: "~/.ssh/`whoami`"}, "'~/.ssh/`whoami`'"},
		{"dollar in host", domain.Server{Host: "$(hostname)", Port: 22, User: "deploy"}, "'$(hostname)'"},
		{"single quote in user", domain.Server{Host: "10.0.1.20", Port: 22, User: "de'ploy"}, `'de'\''ploy'`},
		{"unicode and spaces in key", domain.Server{Host: "h", Port: 22, User: "u", AuthType: domain.AuthKey, KeyPath: "~/ключ ü/k"}, "'~/ключ ü/k'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := render(t, tt.srv); !strings.Contains(got, tt.must) {
				t.Errorf("RenderCommand() = %q, want it to contain %q", got, tt.must)
			}
		})
	}
}

func TestRenderCommandQuotesJumpTarget(t *testing.T) {
	got := render(t, domain.Server{Host: "203.0.113.7", Port: 22, User: "j; touch /tmp/pwned; echo"}, domain.Server{Host: "10.0.2.10", Port: 22, User: "postgres"})
	if must := `-J 'j; touch /tmp/pwned; echo@203.0.113.7'`; !strings.Contains(got, must) {
		t.Errorf("RenderCommand() = %q, want it to contain %q", got, must)
	}
}

// RenderCommand is a renderer: a leading '-' user is shell-quoted but would
// still reach ssh as an option once pasted. domain.Validate is the layer
// that stops that value from being stored at all.
func TestRenderCommandLeavesArgvInjectionToValidate(t *testing.T) {
	srv := domain.Server{Host: "10.0.1.20", Port: 22, User: "-oProxyCommand=touch /tmp/pwned"}
	if got, want := render(t, srv), "ssh '-oProxyCommand=touch /tmp/pwned'@10.0.1.20"; got != want {
		t.Fatalf("RenderCommand() = %q, want %q", got, want)
	}
	if err := srv.Validate(); err == nil {
		t.Fatal("Validate() accepted a user starting with '-'")
	}
}

func TestRenderCommandRejectsControlCharacters(t *testing.T) {
	for _, s := range []domain.Server{
		{Host: "h", User: "a\nb"},
		{Host: "h\x1b", User: "u"},
		{Host: "h", User: "u", AuthType: domain.AuthKey, KeyPath: "/k\r"},
	} {
		if _, err := RenderCommand([]domain.Server{s}, AgentPaths{}); !isUnsafe(err) {
			t.Errorf("RenderCommand(%+v) err = %v", s, err)
		}
	}
}
