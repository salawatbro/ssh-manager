package service

import (
	"fmt"
	"os"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

// UninstallService removes every app-owned artifact and then trashes the app.
// dataDir/logDir are injected (not read from platform here) so tests point them
// at temp dirs and never touch the developer's real data.
type UninstallService struct {
	servers *store.ServerRepo
	secret  secret.Store
	login   LoginAgent
	dataDir string
	logDir  string

	// packaged is true only when running from an installed .app bundle
	// (platform.RunningFromAppBundle at main.go startup). Uninstall refuses to
	// touch anything unless this is true — otherwise `wails3 dev` (which wires
	// in the REAL DataDir/LogDir/keyring) would let a developer nuke their own
	// dev DB, Keychain secrets and LaunchAgent by mistake.
	packaged bool

	// onUninstalled is called only after a fully successful uninstall (main.go
	// wires it to app.Quit). Left unset in tests -> the test asserts it fired.
	onUninstalled func()
}

// NewUninstallService wires the repo (to enumerate servers for Keychain
// cleanup), the keychain, the login agent, and the data/log dirs to remove.
// packaged must be platform.RunningFromAppBundle() — Uninstall is a no-op
// unless it's true.
func NewUninstallService(servers *store.ServerRepo, sec secret.Store, login LoginAgent, dataDir, logDir string, packaged bool) *UninstallService {
	return &UninstallService{servers: servers, secret: sec, login: login, dataDir: dataDir, logDir: logDir, packaged: packaged}
}

// SetOnUninstalled registers the quit callback. Package-level (not a method)
// for the SAME reason as SetForwardDeps: application.NewService binds every
// EXPORTED METHOD to the frontend, and a method here would leak a spurious,
// unusable UninstallService binding.
func SetOnUninstalled(s *UninstallService, fn func()) { s.onUninstalled = fn }

// Uninstall removes app-owned data — Keychain secrets, the start-at-login
// agent, the data and log directories — then moves the app bundle to the Trash
// and asks the app to quit. It never touches ~/.ssh. Every removal is
// best-effort (one failure must not strand the rest — the app is about to be
// gone). If the bundle can't be trashed the data is still gone, so it returns
// that error WITHOUT quitting, letting the UI tell the user to trash the app by
// hand. On full success it fires onUninstalled (quit) and returns nil.
//
// It is a full no-op — nothing is touched, no callback fires — unless
// s.packaged is true, i.e. unless it is running from an installed .app.
func (s *UninstallService) Uninstall() error {
	if !s.packaged {
		return domain.NewError(domain.CodeValidation, "Uninstall is only available in the installed app, not in development.")
	}
	// Keychain first, while the server list is still readable.
	if servers, err := s.servers.List(); err == nil {
		for _, srv := range servers {
			_ = s.secret.Delete(srv.ID)
		}
	}
	_ = s.login.Set(false)      // remove the LaunchAgent (no-op if absent)
	_ = os.RemoveAll(s.dataDir) // sshmgr.db + WAL/shm; open fds survive unlink on macOS
	_ = os.RemoveAll(s.logDir)

	if err := platform.MoveAppBundleToTrash(); err != nil {
		return fmt.Errorf("all data was removed, but the app could not be moved to the Trash — please drag it there yourself: %w", err)
	}
	if s.onUninstalled != nil {
		s.onUninstalled()
	}
	return nil
}
