package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/askpass"
	"github.com/salawat/sshmgr/internal/domain"
)

const testSock = "/Users/me/Library/Application Support/SSHManager/run/agent.sock"

func agentOpts() Options {
	o := opts()
	o.Agent = AgentPaths{
		Socket: testSock,
		PubKeyPath: func(id string) string {
			return "/Users/me/Library/Application Support/SSHManager/pubkeys/" + id + ".pub"
		},
	}
	return o
}

func zishSrv(id, user, host string, key string) domain.Server {
	s := srv(id, user, host, 22, domain.AuthZishKey, "")
	s.AgentKeyID = &key
	return s
}

func TestBuildPlanZishKeyTarget(t *testing.T) {
	p, err := BuildPlan([]domain.Server{zishSrv("t", "deploy", "db.internal", "k1")}, agentOpts(), "")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{SSHPath,
		"-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
		"-o", `IdentityAgent="` + testSock + `"`,
		"-o", `IdentityFile="/Users/me/Library/Application Support/SSHManager/pubkeys/k1.pub"`,
		"-o", "IdentitiesOnly=yes",
		"-p", "22", "-l", "deploy", "--", "db.internal"}
	if !slices.Equal(p.Argv, want) {
		t.Fatalf("argv = %q\nwant   %q", p.Argv, want)
	}
	// Approval happens in Zish: no askpass slot for a Zish key.
	if p.Hops[0] != (askpass.Hop{ServerID: "t", User: "deploy", Host: "db.internal"}) {
		t.Fatalf("hop = %+v", p.Hops[0])
	}
}

func TestBuildPlanZishKeyHop(t *testing.T) {
	hop := zishSrv("b", "bastion", "10.0.0.1", "k2")
	target := srv("t", "root", "db.internal", 22, domain.AuthPassword, "")
	p, err := BuildPlan([]domain.Server{hop, target}, agentOpts(), cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(p.Config), "Host zish-hop-1\n  HostName \"10.0.0.1\"\n  Port 22\n  User \"bastion\"\n"+
		"  IdentityAgent \""+testSock+"\"\n"+
		"  IdentityFile \"/Users/me/Library/Application Support/SSHManager/pubkeys/k2.pub\"\n"+
		"  IdentitiesOnly yes\n") {
		t.Fatalf("config =\n%s", p.Config)
	}
	if slices.Contains(p.Argv, `IdentityAgent="`+testSock+`"`) {
		t.Fatal("the hop's agent leaked onto the target's command line")
	}
}

func TestBuildPlanZishKeyErrors(t *testing.T) {
	noKey := srv("t", "u", "h.example", 22, domain.AuthZishKey, "")
	_, err := BuildPlan([]domain.Server{noKey}, agentOpts(), "")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeAgentKeyMissing {
		t.Fatalf("no key id = %v", err)
	}
	o := agentOpts()
	o.Agent.Socket = ""
	if _, err := BuildPlan([]domain.Server{zishSrv("t", "u", "h.example", "k")}, o, ""); !errors.As(err, &de) || de.Code != domain.CodeAgentUnavail {
		t.Fatalf("no socket = %v", err)
	}
	o = agentOpts()
	o.Agent.Socket = "/tmp/a\nProxyCommand evil"
	if _, err := BuildPlan([]domain.Server{zishSrv("t", "u", "h.example", "k")}, o, ""); !isUnsafe(err) {
		t.Fatalf("newline in socket path = %v", err)
	}
}

func TestRenderCommandZishKey(t *testing.T) {
	got, err := RenderCommand([]domain.Server{zishSrv("t", "deploy", "db.internal", "k1")}, agentOpts().Agent)
	if err != nil {
		t.Fatal(err)
	}
	want := `ssh -o 'IdentityAgent="` + testSock + `"' -o IdentitiesOnly=yes -i '/Users/me/Library/Application Support/SSHManager/pubkeys/k1.pub' deploy@db.internal`
	if got != want {
		t.Fatalf("RenderCommand =\n%s\nwant\n%s", got, want)
	}
}

// The real /usr/bin/ssh must read back the socket path byte for byte,
// including the space in "Application Support" and a '%'.
func TestZishKeyParsesInRealOpenSSH(t *testing.T) {
	if _, err := os.Stat(SSHPath); err != nil {
		t.Skip("no /usr/bin/ssh")
	}
	dir, err := os.MkdirTemp("/tmp", "zk")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	sock := filepath.Join(dir, "Application Support", "run 100%", "agent.sock")
	pub := filepath.Join(dir, "Application Support", "pubkeys", "k1.pub")
	o := opts()
	o.Agent = AgentPaths{Socket: sock, PubKeyPath: func(string) string { return pub }}
	cfg := filepath.Join(dir, "ssh_config")

	hop := zishSrv("b", "bastion", "10.0.0.1", "k1")
	target := zishSrv("t", "deploy", "db.internal", "k1")
	p, err := BuildPlan([]domain.Server{hop, target}, o, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cfg, p.Config, 0o600); err != nil {
		t.Fatal(err)
	}
	// -G prints IdentityAgent after %-expansion: the exact socket path.
	for name, args := range map[string][]string{"target": p.Argv[1:], "hop": {"-F", cfg, "zish-hop-1"}} {
		got := sshG(t, args...)
		expect(t, got, "identityagent", sock)
		expect(t, got, "identityfile", pub)
		expect(t, got, "identitiesonly", "yes")
		if name == "target" {
			expect(t, got, "user", "deploy")
		}
	}
}
