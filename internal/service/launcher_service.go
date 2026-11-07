package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/askpass"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/launcher"
	"github.com/salawat/sshmgr/internal/store"
)

// TerminalOption is one entry of the Settings terminal picker.
type TerminalOption struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Installed       bool   `json:"installed"`
	SupportsTab     bool   `json:"supportsTab"`
	NeedsAutomation bool   `json:"needsAutomation"`
	Note            string `json:"note"`
}

// OpenResult carries a non-error notice for a successful Open, e.g. that the
// chosen terminal was missing and Terminal opened instead.
type OpenResult struct {
	Note string `json:"note"`
}

// LaunchBroker is the slice of *askpass.Broker the launcher needs.
type LaunchBroker interface {
	Issue(l askpass.Launch) (string, error)
	Revoke(launchToken string)
}

// LauncherDeps are wired by main.go through SetLauncherDeps. Unavailable,
// when set, is why this process cannot launch (another Zish holds the
// instance lock, or the runtime folders failed).
type LauncherDeps struct {
	Broker          LaunchBroker
	Locator         launcher.AppLocator
	Runner          launcher.Runner
	ExePath         string
	HomeDir         string
	EnsureLaunchDir func() (string, error)
	Unavailable     error
	// Locked is the backend App Lock state; nil means never locked.
	Locked func() bool
}

// ErrLauncherBusy is LauncherDeps.Unavailable when another Zish instance owns
// the control socket.
var ErrLauncherBusy = domain.NewError(domain.CodeLauncherBusy,
	"Another Zish is already running and handles connections. Quit it, or use that window.")

// ErrLauncherLocked is Open's error while App Lock is engaged.
var ErrLauncherLocked = domain.NewError(domain.CodeTerminalLaunch, "Unlock Zish to connect.")

// LauncherService opens servers in the user's terminal app. Bound to the
// frontend as LauncherService.
type LauncherService struct {
	repo     *store.ServerRepo
	settings *store.SettingsRepo
	deps     LauncherDeps

	mu              sync.Mutex
	automationNoted map[string]bool

	agent *AgentService
}

// SetLauncherAgent gives Open the agent socket for Zish-key servers.
// Package-level so it never becomes a frontend binding.
func SetLauncherAgent(s *LauncherService, as *AgentService) { s.agent = as }

// ErrAgentNotRunning is Open's error for a Zish-key server while the agent
// socket is off.
var ErrAgentNotRunning = domain.NewError(domain.CodeAgentUnavail, "Turn on the Zish agent in Settings › Keys.")

// checkAgentKeys makes sure every Zish-key hop can be served by the agent.
func (s *LauncherService) checkAgentKeys(chain []domain.Server) error {
	for _, srv := range chain {
		if srv.AuthType != domain.AuthZishKey {
			continue
		}
		if !s.agent.running() {
			return ErrAgentNotRunning
		}
		if srv.AgentKeyID == nil {
			return agent.ErrKeyMissing
		}
		if err := s.agent.ensureLaunchable(*srv.AgentKeyID); err != nil {
			return err
		}
	}
	return nil
}

// NewLauncherService returns a service that reports ERR_LAUNCHER_BUSY until
// SetLauncherDeps wires it.
func NewLauncherService(repo *store.ServerRepo, settings *store.SettingsRepo) *LauncherService {
	return &LauncherService{repo: repo, settings: settings, automationNoted: map[string]bool{}}
}

// SetLauncherDeps wires the broker, app locator and runner. Package-level so
// it never becomes a frontend binding.
func SetLauncherDeps(s *LauncherService, deps LauncherDeps) { s.deps = deps }

func (s *LauncherService) ready() error {
	switch {
	case s.deps.Unavailable != nil:
		return s.deps.Unavailable
	case s.deps.Broker == nil || s.deps.Locator == nil || s.deps.Runner == nil || s.deps.EnsureLaunchDir == nil:
		return ErrLauncherBusy
	}
	return nil
}

func launchErr(format string, a ...any) error {
	return domain.NewError(domain.CodeTerminalLaunch, fmt.Sprintf(format, a...))
}

// Open starts an ssh session for the server in the chosen terminal app.
func (s *LauncherService) Open(serverID string) (OpenResult, error) {
	note, err := s.open(serverID, stepOpen{})
	return OpenResult{Note: note}, err
}

// OpenInTab is Open in a new tab of the terminal's front window, whatever the
// "Open in a new tab" setting says (the launcher's ⌘↵). A terminal without
// tabs opens a window.
func (s *LauncherService) OpenInTab(serverID string) (OpenResult, error) {
	note, err := s.open(serverID, stepOpen{inTab: true})
	return OpenResult{Note: note}, err
}

// stepOpen is how a stack step opens its server; the zero value is a plain
// Open.
type stepOpen struct {
	placement domain.Placement
	// first: the stack's first server, with nothing of its own to split.
	first      bool
	runCommand string
	onRedeem   func(pid int)
	inTab      bool
}

func (s *LauncherService) open(serverID string, o stepOpen) (string, error) {
	if err := s.ready(); err != nil {
		return "", err
	}
	// The frontend's no-op-while-locked can lag the backend (e.g. a tray click
	// before boot sync), and a launch issued while locked would auto-fill.
	if s.locked() {
		return "", ErrLauncherLocked
	}
	srv, err := s.repo.Get(serverID)
	if err != nil {
		return "", err
	}
	if o.runCommand != "" {
		srv.RunAfterConnect = o.runCommand
	}
	chain, err := resolveServers(s.repo, srv)
	if err != nil {
		return "", err
	}
	if err := s.checkAgentKeys(chain); err != nil {
		return "", err
	}
	set, err := s.currentSettings()
	if err != nil {
		return "", err
	}
	// A stack keeps one terminal app so its tabs and splits land together.
	if o.placement == "" {
		set = withServerTerminal(set, srv)
	}
	if o.inTab {
		tab := *set
		tab.TerminalOpenInTab = true
		set = &tab
	}
	dir, err := s.newLaunchDir()
	if err != nil {
		return "", err
	}
	token, err := s.prepare(chain, srv.Name, set, dir, o.onRedeem)
	if err != nil {
		_ = os.RemoveAll(dir)
		return "", err
	}
	note, err := s.run(set, filepath.Join(dir, "connect.command"), false, o)
	if err != nil {
		s.deps.Broker.Revoke(token)
		return "", err
	}
	_ = s.repo.BumpUsage(serverID)
	return note, nil
}

func (s *LauncherService) locked() bool { return s.deps.Locked != nil && s.deps.Locked() }

// withServerTerminal returns a copy of set using the server's terminal, if it
// names a known one; an empty or unknown value keeps the Settings default.
func withServerTerminal(set *domain.Settings, srv *domain.Server) *domain.Settings {
	out := *set
	if slices.Contains(domain.TerminalIDs, srv.Terminal) {
		out.Terminal = srv.Terminal
	}
	return &out
}

// prepare writes ssh_config and connect.command into dir and registers the
// launch; it returns the launch token.
func (s *LauncherService) prepare(chain []domain.Server, title string, set *domain.Settings, dir string, onRedeem func(int)) (string, error) {
	plan, err := launcher.BuildPlan(chain, launcher.Options{
		SSHPath:        launcher.SSHPath,
		HomeDir:        s.deps.HomeDir,
		ConnectTimeout: set.ConnectTimeoutSecs,
		KeepAlive:      set.KeepAlive,
		Agent:          s.agent.paths(),
	}, filepath.Join(dir, "ssh_config"))
	if err != nil {
		return "", err
	}
	if plan.Config != nil {
		if err := writeNew(filepath.Join(dir, "ssh_config"), plan.Config, 0o600); err != nil {
			return "", err
		}
	}
	token, err := s.deps.Broker.Issue(askpass.Launch{
		Argv: plan.Argv, Hops: plan.Hops, Dir: dir, Title: title, AutoFill: set.AutoFillSecrets, OnRedeem: onRedeem,
	})
	if err != nil {
		return "", err
	}
	script, err := launcher.Script(s.deps.ExePath, token)
	if err == nil {
		err = writeNew(filepath.Join(dir, "connect.command"), script, 0o700)
	}
	if err != nil {
		s.deps.Broker.Revoke(token)
		return "", err
	}
	return token, nil
}

func (s *LauncherService) currentSettings() (*domain.Settings, error) {
	set, err := s.settings.Get()
	if err != nil {
		return nil, err
	}
	set.Sanitise()
	return set, nil
}

func (s *LauncherService) newLaunchDir() (string, error) {
	root, err := s.deps.EnsureLaunchDir()
	if err != nil {
		return "", domain.NewError(domain.CodeLaunchUnsafe, "Zish can't prepare a private folder for the launch script: "+err.Error())
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	dir := filepath.Join(root, hex.EncodeToString(b[:]))
	if err := os.Mkdir(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

// writeNew creates path exclusively (never following or replacing a file).
func writeNew(path string, data []byte, mode os.FileMode) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode) //nolint:gosec // G304: path is inside a fresh private launch folder
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

// run opens script in the configured terminal. strict (TestTerminal) refuses
// to substitute Terminal.app for a missing app.
func (s *LauncherService) run(set *domain.Settings, script string, strict bool, o stepOpen) (string, error) {
	if set.Terminal == domain.TerminalCustom {
		argv, err := launcher.CustomCommand(set.TerminalCustomCommand, script)
		if err != nil {
			return "", err
		}
		if err := s.deps.Runner.Run(launcher.CustomAttempt(argv)); err != nil {
			return "", launchErr("The custom terminal command failed: %v", err)
		}
		return "", nil
	}
	term, _ := launcher.Lookup(set.Terminal)
	note := ""
	var err error
	app, ok := s.deps.Locator.Locate(term.BundleID)
	if !ok {
		apple, _ := launcher.Lookup(domain.TerminalApple)
		if strict || term.ID == apple.ID {
			return "", domain.NewError(domain.CodeTerminalNotFound, term.Name+" isn't installed.")
		}
		if app, ok = s.deps.Locator.Locate(apple.BundleID); !ok {
			return "", domain.NewError(domain.CodeTerminalNotFound, "Neither "+term.Name+" nor Terminal is installed.")
		}
		note = term.Name + " isn't installed — opened in Terminal."
		term = apple
	}
	var attempts []launcher.Attempt
	if o.placement == "" {
		attempts, err = launcher.OpenCommands(term.ID, app, script, set.TerminalOpenInTab)
	} else {
		mode := launcher.StepMode(term.ID, launcher.TabSupported(term, app), o.placement, o.first)
		attempts, err = launcher.StackCommands(term.ID, app, script, mode)
	}
	if err != nil {
		return "", launchErr("%v", err)
	}
	denied := false
	var last error
	for _, a := range attempts {
		err := s.deps.Runner.Run(a)
		if err == nil {
			if denied && s.noteAutomationOnce(term.ID) {
				note = "Zish opened a new " + term.Name + " window. To open tabs, allow Zish in System Settings › Privacy & Security › Automation."
			}
			return note, nil
		}
		denied = denied || errors.Is(err, launcher.ErrAutomationDenied)
		last = err
	}
	if denied {
		return "", domain.NewError(domain.CodeAutomationDenied,
			"Allow Zish to control "+term.Name+" in System Settings › Privacy & Security › Automation.")
	}
	return "", launchErr("Couldn't open %s: %v", term.Name, last)
}

func (s *LauncherService) noteAutomationOnce(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.automationNoted[id] {
		return false
	}
	s.automationNoted[id] = true
	return true
}

// Terminals lists the terminal apps for the Settings picker.
func (s *LauncherService) Terminals() []TerminalOption {
	out := make([]TerminalOption, 0, len(launcher.Catalog)+1)
	for _, t := range launcher.Catalog {
		opt := TerminalOption{ID: t.ID, Name: t.Name, SupportsTab: t.SupportsTab, NeedsAutomation: t.NeedsAutomation, Note: t.Note}
		if s.deps.Locator != nil {
			var app launcher.AppInfo
			app, opt.Installed = s.deps.Locator.Locate(t.BundleID)
			if opt.Installed {
				opt.SupportsTab = launcher.TabSupported(t, app)
			}
		}
		out = append(out, opt)
	}
	return append(out, TerminalOption{
		ID: domain.TerminalCustom, Name: "Custom command", Installed: true,
		Note: "Runs your command without a shell; {script} is the launch script.",
	})
}

// testScript is the constant script TestTerminal opens.
const testScript = `#!/bin/sh
rm -f -- "$0"
printf 'Zish can open this terminal.\nPress Return to close this window.\n'
read -r _
`

// TestTerminal opens the chosen terminal with a script that only prints a
// line. It triggers macOS's Automation prompt before the first real connect.
func (s *LauncherService) TestTerminal() error {
	if err := s.ready(); err != nil {
		return err
	}
	set, err := s.currentSettings()
	if err != nil {
		return err
	}
	dir, err := s.newLaunchDir()
	if err != nil {
		return err
	}
	time.AfterFunc(askpass.LaunchTTL, func() { _ = os.RemoveAll(dir) })
	script := filepath.Join(dir, "connect.command")
	if err := writeNew(script, []byte(testScript), 0o700); err != nil {
		return err
	}
	_, err = s.run(set, script, true, stepOpen{})
	return err
}
