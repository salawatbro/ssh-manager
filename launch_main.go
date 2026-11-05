package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/salawat/sshmgr/internal/askpass"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/launcher"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/service"
	"github.com/salawat/sshmgr/internal/store"
)

// bootLocked reports whether the app starts locked: "Require unlock" is on
// and a PIN exists. A tray-only login start is then locked until unlocked.
func bootLocked(settings *store.SettingsRepo, sec secret.Store) bool {
	s, err := settings.Get()
	if err != nil || !s.LockEnabled {
		return false
	}
	_, err = sec.GetAppLockHash()
	return err == nil
}

func launchUnavailable(err error) error {
	return domain.NewError(domain.CodeTerminalLaunch, "Zish can't open terminals: "+err.Error())
}

// startLaunchRuntime recreates the askpass symlink, clears stale launch
// folders and serves the control socket. instanceErr is the result of taking
// the single-instance lock: only the holder serves sockets. When anything
// fails the launcher reports why instead of launching; the rest of the app
// keeps working. The returned stop func is for OnShutdown.
func startLaunchRuntime(sec askpass.Secrets, gate *service.LockGate, instanceErr error) (service.LauncherDeps, func()) {
	deps := service.LauncherDeps{
		Locator:         newAppLocator(),
		Runner:          launcher.ExecRunner{},
		EnsureLaunchDir: platform.EnsureLaunchDir,
		Locked:          gate.Locked,
	}
	noop := func() {}
	if instanceErr != nil {
		deps.Unavailable = launchUnavailable(instanceErr)
		if errors.Is(instanceErr, platform.ErrInstanceLocked) {
			deps.Unavailable = service.ErrLauncherBusy
		}
		return deps, noop
	}
	runDir, err := platform.EnsureRunDir()
	if err != nil {
		deps.Unavailable = launchUnavailable(err)
		return deps, noop
	}
	fail := func(err error) (service.LauncherDeps, func()) {
		deps.Unavailable = launchUnavailable(err)
		return deps, noop
	}

	exe, err := os.Executable()
	if err == nil {
		exe, err = filepath.EvalSymlinks(exe)
	}
	if err != nil {
		return fail(err)
	}
	// Recreated at every start so it follows the app when it moves.
	link := filepath.Join(runDir, askpass.LinkName)
	_ = os.Remove(link)
	if err := os.Symlink(exe, link); err != nil {
		return fail(fmt.Errorf("askpass link: %w", err))
	}
	launchRoot, err := platform.EnsureLaunchDir()
	if err != nil {
		return fail(err)
	}
	_ = platform.ClearDir(launchRoot) // tokens live in memory only; no launch survives a restart
	sock, err := platform.SocketPath(askpass.ControlSocketName)
	if err == nil {
		err = platform.EnsureSocketDir(sock)
	}
	if err != nil {
		return fail(err)
	}
	home, _ := os.UserHomeDir()

	broker := askpass.NewBroker(askpass.BrokerConfig{Secrets: sec, AskpassPath: link, SocketPath: sock, LaunchRoot: launchRoot})
	server := askpass.NewServer(broker)
	if err := server.Start(sock); err != nil {
		return fail(fmt.Errorf("control socket: %w", err))
	}
	gate.OnLock(broker.RevokeAll)

	ticker := time.NewTicker(time.Minute)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-ticker.C:
				broker.Sweep()
			case <-done:
				return
			}
		}
	}()

	deps.Broker = broker
	deps.ExePath = exe
	deps.HomeDir = home
	return deps, func() {
		ticker.Stop()
		close(done)
		broker.RevokeAll()
		server.Stop()
	}
}
