package service

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func (f *launcherFixture) redeemLast(t *testing.T) []string {
	t.Helper()
	dirs := f.launchDirs(t)
	body, err := os.ReadFile(filepath.Join(dirs[len(dirs)-1], "connect.command"))
	if err != nil {
		t.Fatal(err)
	}
	m := tokenInScript.FindSubmatch(body)
	if m == nil {
		t.Fatalf("no token in script:\n%s", body)
	}
	r, err := f.broker.Redeem(string(m[1]))
	if err != nil {
		t.Fatal(err)
	}
	return r.Argv
}

func TestOpenUsesTheServersTerminal(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent, Terminal: domain.TerminalGhostty})

	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	if run := f.runner.runs[0]; !slices.Contains(run, "com.mitchellh.ghostty") {
		t.Fatalf("runs = %q, want Ghostty", f.runner.runs)
	}
	set, _ := f.settings.Get()
	if set.Terminal != domain.TerminalApple {
		t.Fatalf("Open changed Settings.Terminal to %q", set.Terminal)
	}

	plain := f.add(t, domain.Server{ID: "b", Name: "b", Host: "h", User: "u", AuthType: domain.AuthAgent})
	f.runner.runs = nil
	if _, err := f.svc.Open(plain.ID); err != nil {
		t.Fatal(err)
	}
	if run := f.runner.runs[0]; run[2] != "com.apple.Terminal" {
		t.Fatalf("server without an override: runs = %q", f.runner.runs)
	}
}

func TestOpenServerCustomTerminalUsesTheSettingsCommand(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	f.setTerminal(t, func(s *domain.Settings) { s.TerminalCustomCommand = `open -na "My Term" --args -e {script}` })
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent, Terminal: domain.TerminalCustom})

	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	if run := f.runner.runs[0]; len(run) != 6 || run[2] != "My Term" || !strings.HasSuffix(run[5], "/connect.command") {
		t.Fatalf("custom argv = %q", run)
	}
}

// A stored value outside TerminalIDs (a hand-edited database) falls back to
// the Settings default instead of failing the launch.
func TestOpenUnknownServerTerminalFallsBackToSettings(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	f.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalGhostty })
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent, Terminal: "hyper"})

	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	if run := f.runner.runs[0]; !slices.Contains(run, "com.mitchellh.ghostty") {
		t.Fatalf("runs = %q, want Ghostty from Settings", f.runner.runs)
	}
}

func TestOpenRunAfterConnectReachesTheArgv(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "db", Name: "db", Host: "db.internal", User: "root", AuthType: domain.AuthAgent, RunAfterConnect: "cd /srv/web"})

	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	argv := f.redeemLast(t)
	n := len(argv)
	want := []string{"-t", "--", "db.internal", "cd /srv/web\nexec \"$SHELL\" -l"}
	if n < 4 || !slices.Equal(argv[n-4:], want) {
		t.Fatalf("argv = %q", argv)
	}
	body, _ := os.ReadFile(filepath.Join(f.launchDirs(t)[0], "connect.command"))
	if strings.Contains(string(body), "/srv/web") {
		t.Fatalf("launch script carries the command:\n%s", body)
	}
}
