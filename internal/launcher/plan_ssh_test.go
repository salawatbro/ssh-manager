package launcher

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

// sshG runs `ssh -G`, which resolves the configuration and prints it without
// ever connecting.
func sshG(t *testing.T, args ...string) map[string][]string {
	t.Helper()
	out, err := exec.Command(SSHPath, append([]string{"-G"}, args...)...).CombinedOutput() //nolint:gosec // test-only, fixed binary
	if err != nil {
		t.Fatalf("ssh -G %q: %v\n%s", args, err, out)
	}
	got := map[string][]string{}
	for _, line := range strings.Split(string(out), "\n") {
		k, v, ok := strings.Cut(line, " ")
		if ok {
			got[k] = append(got[k], v)
		}
	}
	return got
}

func expect(t *testing.T, cfg map[string][]string, key, want string) {
	t.Helper()
	if got := cfg[key]; len(got) == 0 || got[0] != want {
		t.Errorf("%s = %q, want %q", key, got, want)
	}
}

// The real /usr/bin/ssh must read back exactly what Zish meant, including
// values with spaces, quotes, '%' and '$'.
func TestBuildPlanParsesInRealOpenSSH(t *testing.T) {
	if _, err := os.Stat(SSHPath); err != nil {
		t.Skip("no /usr/bin/ssh")
	}
	dir, err := os.MkdirTemp("/tmp", "zl")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	cfg := filepath.Join(dir, "ssh_config")

	key := "/tmp/z k'ey \"q\" $(id) `id` %h \\ ünï"
	user := "jo hn$x%h"
	hop1 := srv("b", user, "10.0.0.1", 2222, domain.AuthKey, key)
	hop2 := srv("j", "ops", "2001:db8::7", 22, domain.AuthPassword, "")
	target := srv("t", user, "db.internal", 2200, domain.AuthKey, key)

	p, err := BuildPlan([]domain.Server{hop1, hop2, target}, opts(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cfg, p.Config, 0o600); err != nil {
		t.Fatal(err)
	}
	rawKey := strings.ReplaceAll(key, "%", "%%") // -G prints IdentityFile before %-expansion

	got := sshG(t, p.Argv[1:]...)
	expect(t, got, "hostname", "db.internal")
	expect(t, got, "user", user)
	expect(t, got, "port", "2200")
	expect(t, got, "identityfile", rawKey)
	expect(t, got, "identitiesonly", "yes")
	expect(t, got, "proxyjump", "zish-hop-1,zish-hop-2")
	expect(t, got, "connecttimeout", "10")
	expect(t, got, "serveraliveinterval", "30")
	expect(t, got, "serveralivecountmax", "3")

	h1 := sshG(t, "-F", cfg, "zish-hop-1")
	expect(t, h1, "hostname", "10.0.0.1")
	expect(t, h1, "user", user)
	expect(t, h1, "port", "2222")
	expect(t, h1, "identityfile", rawKey)
	expect(t, h1, "identitiesonly", "yes")
	expect(t, h1, "connecttimeout", "10")
	expect(t, h1, "serveraliveinterval", "30")

	h2 := sshG(t, "-F", cfg, "zish-hop-2")
	expect(t, h2, "hostname", "2001:db8::7")
	expect(t, h2, "user", "ops")
	expect(t, h2, "port", "22")
	expect(t, h2, "preferredauthentications", "password,keyboard-interactive")
}
