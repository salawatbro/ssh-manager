package service

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/askpass"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/launcher"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

type fakeLocator map[string]launcher.AppInfo

func (f fakeLocator) Locate(id string) (launcher.AppInfo, bool) {
	a, ok := f[id]
	return a, ok
}

type fakeRunner struct {
	runs [][]string
	errs []error // per call; nil past the end
}

func (f *fakeRunner) Run(a launcher.Attempt) error {
	f.runs = append(f.runs, a.Argv)
	if i := len(f.runs) - 1; i < len(f.errs) {
		return f.errs[i]
	}
	return nil
}

type launcherFixture struct {
	svc      *LauncherService
	repo     *store.ServerRepo
	settings *store.SettingsRepo
	broker   *askpass.Broker
	runner   *fakeRunner
	locator  fakeLocator
	root     string
}

var allApps = fakeLocator{
	"com.apple.Terminal":    {Path: "/System/Applications/Utilities/Terminal.app"},
	"com.googlecode.iterm2": {Path: "/Applications/iTerm.app", Version: "3.5.0"},
	"com.mitchellh.ghostty": {Path: "/Applications/Ghostty.app", Version: "1.2.0"},
}

func newLauncherFixture(t *testing.T, loc fakeLocator) *launcherFixture {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatal(err)
	}
	f := &launcherFixture{
		repo:     store.NewServerRepo(db),
		settings: store.NewSettingsRepo(db),
		runner:   &fakeRunner{},
		locator:  loc,
		root:     t.TempDir(),
	}
	f.broker = askpass.NewBroker(askpass.BrokerConfig{Secrets: secret.NewFake(), AskpassPath: "/r/zish-askpass", SocketPath: "/r/control.sock", LaunchRoot: f.root})
	f.svc = NewLauncherService(f.repo, f.settings)
	SetLauncherDeps(f.svc, LauncherDeps{
		Broker:          f.broker,
		Locator:         loc,
		Runner:          f.runner,
		ExePath:         "/Applications/Zish.app/Contents/MacOS/sshmgr",
		HomeDir:         "/Users/me",
		EnsureLaunchDir: func() (string, error) { return f.root, nil },
	})
	return f
}

func (f *launcherFixture) setTerminal(t *testing.T, mut func(*domain.Settings)) {
	t.Helper()
	s, err := f.settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	mut(s)
	if err := f.settings.Save(s); err != nil {
		t.Fatal(err)
	}
}

func (f *launcherFixture) add(t *testing.T, s domain.Server) domain.Server {
	t.Helper()
	if s.Port == 0 {
		s.Port = 22
	}
	if s.Environment == "" {
		s.Environment = domain.EnvNone
	}
	if err := f.repo.Create(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func (f *launcherFixture) launchDirs(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(f.root)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, e := range entries {
		out = append(out, filepath.Join(f.root, e.Name()))
	}
	return out
}

var tokenInScript = regexp.MustCompile(`--connect ([0-9a-f]{64})\n`)

func TestOpenWritesScriptRunsTerminalAndBumpsUsage(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "db", Name: "prod; $(id)", Host: "db.internal", User: "root", AuthType: domain.AuthPassword})

	res, err := f.svc.Open(s.ID)
	if err != nil || res.Note != "" {
		t.Fatalf("Open = %+v, %v", res, err)
	}
	dirs := f.launchDirs(t)
	if len(dirs) != 1 {
		t.Fatalf("launch dirs = %v", dirs)
	}
	if fi, _ := os.Stat(dirs[0]); fi.Mode().Perm() != 0o700 {
		t.Fatalf("launch dir mode %o", fi.Mode().Perm())
	}
	script := filepath.Join(dirs[0], "connect.command")
	fi, err := os.Stat(script)
	if err != nil || fi.Mode().Perm() != 0o700 {
		t.Fatalf("script: %v %v", fi, err)
	}
	if _, err := os.Stat(filepath.Join(dirs[0], "ssh_config")); !os.IsNotExist(err) {
		t.Fatal("ssh_config written without a jump host")
	}
	body, _ := os.ReadFile(script)
	for _, leak := range []string{"db.internal", "root", "prod", "$(id)"} {
		if strings.Contains(string(body), leak) {
			t.Fatalf("script carries server data %q:\n%s", leak, body)
		}
	}
	if want := [][]string{{"/usr/bin/open", "-b", "com.apple.Terminal", script}}; !slices.EqualFunc(f.runner.runs, want, slices.Equal[[]string]) {
		t.Fatalf("runs = %q", f.runner.runs)
	}
	m := tokenInScript.FindSubmatch(body)
	if m == nil {
		t.Fatalf("no token in script:\n%s", body)
	}
	r, err := f.broker.Redeem(string(m[1]))
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"/usr/bin/ssh", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
		"-o", "PreferredAuthentications=password,keyboard-interactive", "-p", "22", "-l", "root", "--", "db.internal"}
	if !slices.Equal(r.Argv, want) || r.Title != "prod; $(id)" || r.Env[askpass.EnvAskpassRequire] != "force" {
		t.Fatalf("redeemed %+v", r)
	}
	got, _ := f.repo.Get(s.ID)
	if got.UseCount != 1 || got.LastUsedAt == nil {
		t.Fatalf("usage not bumped: %+v", got)
	}
}

func TestOpenJumpChainWritesPrivateConfig(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	jump := f.add(t, domain.Server{ID: "j", Name: "bastion", Host: "10.0.0.1", User: "jump", AuthType: domain.AuthKey, KeyPath: "~/.ssh/b ü"})
	tgt := f.add(t, domain.Server{ID: "t", Name: "db", Host: "db.internal", User: "root", AuthType: domain.AuthAgent, JumpID: &jump.ID})
	if _, err := f.svc.Open(tgt.ID); err != nil {
		t.Fatal(err)
	}
	cfg := filepath.Join(f.launchDirs(t)[0], "ssh_config")
	fi, err := os.Stat(cfg)
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("config: %v %v", fi, err)
	}
	b, _ := os.ReadFile(cfg)
	if !strings.Contains(string(b), `IdentityFile "/Users/me/.ssh/b ü"`) {
		t.Fatalf("config:\n%s", b)
	}
}

func TestOpenFallsBackToTerminalWithANote(t *testing.T) {
	f := newLauncherFixture(t, fakeLocator{"com.apple.Terminal": {}})
	f.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalITerm2; s.TerminalOpenInTab = true })
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent})
	res, err := f.svc.Open(s.ID)
	if err != nil || res.Note != "iTerm2 isn't installed — opened in Terminal." {
		t.Fatalf("Open = %+v, %v", res, err)
	}
	if f.runner.runs[0][2] != "com.apple.Terminal" {
		t.Fatalf("runs = %q", f.runner.runs)
	}

	none := newLauncherFixture(t, fakeLocator{})
	s = none.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent})
	if _, err := none.svc.Open(s.ID); codeOf(t, err) != domain.CodeTerminalNotFound {
		t.Fatalf("no terminal: %v", err)
	}
	if len(none.launchDirs(t)) != 0 {
		t.Fatal("launch dir left after failure")
	}
}

func TestOpenFailureRevokesAndDoesNotBump(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	f.runner.errs = []error{errors.New("open: boom")}
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent})
	if _, err := f.svc.Open(s.ID); codeOf(t, err) != domain.CodeTerminalLaunch {
		t.Fatalf("err = %v", err)
	}
	if len(f.launchDirs(t)) != 0 {
		t.Fatal("launch dir left after a failed open")
	}
	if got, _ := f.repo.Get(s.ID); got.UseCount != 0 {
		t.Fatal("usage bumped on failure")
	}
}

func TestOpenAutomationDenied(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	f.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalITerm2 })
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent})

	f.runner.errs = []error{launcher.ErrAutomationDenied}
	res, err := f.svc.Open(s.ID)
	if err != nil || !strings.Contains(res.Note, "Automation") {
		t.Fatalf("fallback: %+v, %v", res, err)
	}
	f.runner.runs, f.runner.errs = nil, []error{launcher.ErrAutomationDenied}
	if res, _ := f.svc.Open(s.ID); res.Note != "" {
		t.Fatalf("automation note repeated: %q", res.Note)
	}
	f.runner.runs, f.runner.errs = nil, []error{launcher.ErrAutomationDenied, launcher.ErrAutomationDenied}
	if _, err := f.svc.Open(s.ID); codeOf(t, err) != domain.CodeAutomationDenied {
		t.Fatalf("all denied: %v", err)
	}
}

func TestOpenCustomCommand(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthAgent})
	f.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalCustom })
	_, err := f.svc.Open(s.ID)
	if codeOf(t, err) != domain.CodeTerminalLaunch || !strings.Contains(err.Error(), "Set a custom terminal command") {
		t.Fatalf("empty template: %v", err)
	}
	f.setTerminal(t, func(s *domain.Settings) { s.TerminalCustomCommand = `open -na "My Term" --args -e {script}` })
	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	run := f.runner.runs[0]
	if len(run) != 6 || run[2] != "My Term" || !strings.HasSuffix(run[5], "/connect.command") || !strings.HasPrefix(run[5], f.root) {
		t.Fatalf("custom argv = %q", run)
	}
}

func TestOpenRejectsUnsafeServerValues(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "a", Name: "a", Host: "h", User: "u", AuthType: domain.AuthKey, KeyPath: "/k\nProxyCommand touch /tmp/pwned"})
	if _, err := f.svc.Open(s.ID); codeOf(t, err) != domain.CodeLaunchUnsafe {
		t.Fatalf("err = %v", err)
	}
	if len(f.launchDirs(t)) != 0 || len(f.runner.runs) != 0 {
		t.Fatal("unsafe launch left files or ran a terminal")
	}
}

func TestOpenErrors(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	if _, err := f.svc.Open("missing"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing server: %v", err)
	}
	busy := NewLauncherService(f.repo, f.settings)
	if _, err := busy.Open("x"); codeOf(t, err) != domain.CodeLauncherBusy {
		t.Fatalf("unwired: %v", err)
	}
	SetLauncherDeps(busy, LauncherDeps{Unavailable: ErrLauncherBusy})
	if err := busy.TestTerminal(); codeOf(t, err) != domain.CodeLauncherBusy {
		t.Fatalf("busy test terminal: %v", err)
	}
}

func TestOpenRefusesWhileLocked(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "db", Name: "db", Host: "db.internal", User: "root", AuthType: domain.AuthPassword})
	gate := NewLockGate(true)
	deps := f.svc.deps
	deps.Locked = gate.Locked
	SetLauncherDeps(f.svc, deps)

	if _, err := f.svc.Open(s.ID); !errors.Is(err, ErrLauncherLocked) {
		t.Fatalf("Open while locked = %v", err)
	}
	if len(f.launchDirs(t)) != 0 || len(f.runner.runs) != 0 {
		t.Fatal("locked Open wrote a launch or ran a terminal")
	}
	gate.Unlock()
	if _, err := f.svc.Open(s.ID); err != nil {
		t.Fatalf("Open after unlock = %v", err)
	}
}

func TestTerminalsListsInstalledApps(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	opts := f.svc.Terminals()
	byID := map[string]TerminalOption{}
	for _, o := range opts {
		byID[o.ID] = o
	}
	if !byID["terminal"].Installed || !byID["iterm2"].Installed || !byID["iterm2"].SupportsTab || byID["kitty"].Installed {
		t.Fatalf("options = %+v", opts)
	}
	if g := byID["ghostty"]; !g.Installed || g.SupportsTab {
		t.Fatalf("ghostty 1.2 = %+v", g)
	}
	if c := byID["custom"]; !c.Installed || opts[len(opts)-1].ID != "custom" {
		t.Fatalf("custom = %+v", c)
	}
}

func TestTestTerminal(t *testing.T) {
	f := newLauncherFixture(t, allApps)
	if err := f.svc.TestTerminal(); err != nil {
		t.Fatal(err)
	}
	script := f.runner.runs[0][3]
	body, _ := os.ReadFile(script)
	if string(body) != testScript {
		t.Fatalf("test script = %q", body)
	}
	f.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalKitty })
	if err := f.svc.TestTerminal(); codeOf(t, err) != domain.CodeTerminalNotFound {
		t.Fatalf("missing app: %v", err)
	}
}
