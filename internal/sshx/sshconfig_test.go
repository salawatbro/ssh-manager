package sshx

import (
	"strings"
	"testing"
)

const sampleConfig = `
# comment
Host bastion
    HostName bastion.example.com
    User ops
    Port 2222
    IdentityFile ~/.ssh/id_bastion

Host web-01
    HostName 10.0.1.20
    User deploy
    ProxyJump bastion

Host *
    ServerAliveInterval 30

Host a b
    HostName multi.example.com

Host lonely
`

func TestParseSSHConfig(t *testing.T) {
	hosts, err := ParseSSHConfig(strings.NewReader(sampleConfig))
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 5 {
		t.Fatalf("want 5 blocks, got %d: %+v", len(hosts), hosts)
	}
	byAlias := map[string]ConfigHost{}
	for _, h := range hosts {
		byAlias[h.Alias] = h
	}

	b := byAlias["bastion"]
	if b.HostName != "bastion.example.com" || b.User != "ops" || b.Port != 2222 || b.IdentityFile != "~/.ssh/id_bastion" {
		t.Fatalf("bastion parsed wrong: %+v", b)
	}
	w := byAlias["web-01"]
	if w.HostName != "10.0.1.20" || w.ProxyJump != "bastion" || w.Port != 22 {
		t.Fatalf("web-01 parsed wrong: %+v", w)
	}
	// Host * is a wildcard block.
	if !byAlias["*"].Wildcard {
		t.Fatal("Host * not flagged wildcard")
	}
	// Multi-pattern "Host a b" is treated as wildcard (ambiguous for import).
	if !byAlias["a b"].Wildcard {
		t.Fatalf("multi-pattern not flagged: %+v", byAlias["a b"])
	}
	// A Host with no HostName defaults HostName to the alias (ssh semantics).
	if byAlias["lonely"].HostName != "lonely" {
		t.Fatalf("HostName default wrong: %+v", byAlias["lonely"])
	}
}
