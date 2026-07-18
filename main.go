// Command sshmgr is a local SSH connection manager. It opens the database,
// binds the services to the frontend and runs the desktop window. Everything
// stays on this machine: no account, no telemetry, no network calls (SEC-09).
package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/salawat/sshmgr/internal/forward"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/service"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
	"github.com/salawat/sshmgr/internal/term"
)

//go:embed all:frontend/dist
var assets embed.FS

// mainWindow is captured so the global ⌘⇧S hot key and the tray can show/hide
// it. onGlobalHotkey is the toggle the cgo hot-key callback invokes; it is set
// in the ApplicationStarted hook (after NSApp exists) so the callback never
// runs before it is wired.
var (
	mainWindow     *application.WebviewWindow
	onGlobalHotkey func()
	// onCloseRequested is what the close-guard's red ✕ interceptor calls (via
	// goCloseRequested in close_guard_darwin.go). It is set in the
	// ApplicationStarted hook, after settingsService and mainWindow exist.
	onCloseRequested func()
)

func main() {
	dbPath, err := platform.DBPath()
	if err != nil {
		fatalStartup("cannot resolve the database path", err)
	}
	if _, err := platform.EnsureDataDir(); err != nil {
		fatalStartup("cannot prepare the data folder", err)
	}
	db, err := store.Open(dbPath)
	if err != nil {
		fatalStartup("cannot open the database", err)
	}
	// Needed to Close() on shutdown below (SEC-05, NFR-04) — fetched now,
	// next to the Open call it belongs with, rather than at the point of use.
	sqlDB, err := db.DB()
	if err != nil {
		fatalStartup("cannot access the database connection", err)
	}

	knownHostsPath, err := platform.KnownHostsPath()
	if err != nil {
		fatalStartup("cannot resolve the known_hosts path", err)
	}

	// The prompter emits through the global app, resolved at emit time — this
	// dodges the wiring cycle (the app is built from the services below, but
	// the prompter only needs app.Event much later, during a dial). appEmitter
	// is defined in package main (below) because it imports application, which
	// is cgo-gated and must not be pulled into internal/service.
	prompter := service.NewHostKeyPrompter(appEmitter{})
	// codePrompter answers a TOTP/2FA keyboard-interactive question a
	// TwoFactor server's auto-fill (buildKIChallenge, driven by the
	// keychain-stored TOTP secret credsFor attaches) could not resolve on
	// its own — same event/channel pattern as prompter above, just a typed
	// code instead of a yes/no. The code:request event is registered below
	// (see the init func near the hostkey:request registration) so the
	// binding generator gives the frontend typed TypeScript for it; the
	// prompter itself is wired into both the dialer and SSHService here —
	// a nil codePrompter on the dialer would make any 2FA connect needing
	// the interactive fallback fail outright.
	codePrompter := service.NewCodePrompter(appEmitter{})
	verifier, err := sshx.NewVerifier(knownHostsPath, prompter)
	if err != nil {
		fatalStartup("cannot open known_hosts", err)
	}
	// dialTimeout (FR-04.3) fast-fails an unreachable host; handshakeDeadline
	// is the overall connect ceiling and must clear HostKeyPrompter's 60s
	// prompt budget with margin — see the Dialer field comments in
	// internal/sshx/client.go for why the two must differ.
	dialer := sshx.NewDialer(verifier, 10*time.Second, 75*time.Second)
	dialer.SetCodePrompter(codePrompter)

	// term.Manager runs the PTY pump. 16ms flush caps term:data at ~60/s (no
	// backpressure); 30s keep-alive detects a dead peer (dizayn manbasi).
	// It emits through the same appEmitter the host-key prompter uses.
	termMgr := term.NewManager(appEmitter{}, 16*time.Millisecond, 30*time.Second)

	repo := store.NewServerRepo(db)
	kr := secret.NewKeyring()
	serverService := service.NewServerService(repo, kr, dialer)
	sshService := service.NewSSHService(prompter, repo, kr, dialer, termMgr, codePrompter)
	settingsRepo := store.NewSettingsRepo(db)
	settingsService := service.NewSettingsService(settingsRepo, platform.NewLoginAgent())
	importService, err := service.NewImportService(repo)
	if err != nil {
		fatalStartup("cannot resolve the ssh config path", err)
	}
	dataService := &DataService{servers: serverService, db: db}
	snippetRepo := store.NewSnippetRepo(db)
	snippetService := service.NewSnippetService(snippetRepo)

	// forwardMgr's emit closure only runs at runtime, on a state transition
	// well after app start (see appEmitter's comment above for why
	// application.Get() is safe there but not at construction time) — the
	// same deferred-lookup pattern termMgr uses via appEmitter.
	forwardRepo := store.NewForwardRepo(db)
	forwardMgr := forward.NewManager(func(st forward.Status) {
		_ = application.Get().Event.Emit("forward:status", st)
	})
	forwardService := service.NewForwardService(forwardRepo, repo, kr, dialer, forwardMgr)
	sftpService := service.NewSftpService(repo, kr, dialer, appEmitter{})

	uninstallDataDir, _ := platform.DataDir()
	uninstallLogDir, _ := platform.LogDir()
	uninstallService := service.NewUninstallService(repo, kr, platform.NewLoginAgent(), uninstallDataDir, uninstallLogDir, platform.RunningFromAppBundle())

	// Wires forwardRepo + forwardMgr into serverService so Delete tears down a
	// server's live tunnels first (Task 4's deviation: a package-level func,
	// not a method — see SetForwardDeps' doc comment in server_service.go for
	// why a method form would leak a bogus frontend RPC). Must run after all
	// three of serverService, forwardRepo and forwardMgr exist, which it does
	// here.
	service.SetForwardDeps(serverService, forwardRepo, forwardMgr)

	// FR-04.3: the Connection-timeout setting drives the dialer live — read at
	// each dial rather than baked in at construction, so a Settings change
	// takes effect on the very next connect. Falls back to 10s if the store
	// read fails (matches domain.Settings' own ConnectTimeoutSecs default).
	dialer.SetDialTimeoutProvider(func() time.Duration {
		if s, err := settingsService.Get(); err == nil {
			return time.Duration(s.ConnectTimeoutSecs) * time.Second
		}
		return 10 * time.Second
	})

	app := application.New(application.Options{
		Name:        "SSH Manager",
		Description: "Local SSH connection manager",
		// A *domain.Error's Code must reach the frontend even when a service
		// wraps it — see service.MarshalError.
		MarshalError: service.MarshalError,
		Services: []application.Service{
			application.NewService(serverService),
			application.NewService(sshService),
			application.NewService(settingsService),
			application.NewService(importService),
			application.NewService(dataService),
			application.NewService(forwardService),
			application.NewService(snippetService),
			application.NewService(sftpService),
			application.NewService(uninstallService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			// The app runs in the menu-bar tray: dismissing the window must not
			// quit it. The red close button is remapped to hide (see
			// interceptCloseButton); this false is the belt-and-suspenders so no
			// other last-window-closed path can terminate the process. Quit is
			// ⌘Q or the tray's Quit.
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		// FR-12 General: confirm before quitting when sessions are open. Wails
		// calls ShouldQuit on every quit attempt (⌘Q, tray Quit, ✕-when-keep-off);
		// returning false cancels it. No cgo needed.
		//
		// Dialog.Question().Show() is safe to call synchronously right here even
		// though ShouldQuit itself runs on the main thread (AppKit invokes
		// applicationShouldTerminate: — and so shouldQuitApplication() ->
		// ShouldQuit() — directly on it): App.dispatchOnMainThread (which
		// InvokeSync/InvokeAsync funnel through) has an isOnMainThread fast path
		// that runs the callback inline instead of dispatching, and
		// dialogRunModal (dialogs_darwin.go) calls the blocking [NSAlert
		// runModal] when no parent window is attached — so Show() only returns
		// after the pressed button's OnClick has already run. That is why a
		// plain closure-captured bool below is safe (no channel, no goroutine):
		// verified by reading the Wails v3 alpha2.117 source, since the brief's
		// assumed `Show() string` return does not exist in this version — the
		// pressed button is reported via AddButton(label).OnClick(func()), not
		// a return value.
		ShouldQuit: func() bool {
			s, err := settingsService.Get()
			if err != nil || !s.ConfirmOnQuit || termMgr.SessionCount() == 0 {
				// Real quit, no confirmation needed: best-effort tear down any
				// live tunnels before the process goes away. forwardMgr.StopAll
				// closes each tunnel's listener/conn and waits for its own
				// goroutines only (not the whole app), so this stays prompt —
				// the process exiting would clean these up anyway, this just
				// makes it deterministic rather than relying on that.
				forwardMgr.StopAll()
				return true
			}
			quit := false
			dialog := application.Get().Dialog.Question().
				SetTitle("Quit SSH Manager?").
				SetMessage(fmt.Sprintf("%d terminal session(s) are still open. Quit and close them?", termMgr.SessionCount()))
			dialog.AddButton("Quit").OnClick(func() { quit = true; forwardMgr.StopAll() })
			dialog.AddButton("Cancel")
			dialog.Show()
			return quit
		},
	})

	// UI-02: the app is dark regardless of the system setting. The window
	// itself is pinned dark via MacWindow.Appearance below, but the menu bar
	// and the fullscreen title-bar reveal follow NSApp's appearance, which
	// Wails exposes no option for — pin it here, once NSApp exists.
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		forceDarkAppearance()
		// Wire the toggle BEFORE registering the hot key, so the first ⌘⇧S can
		// never fire into a nil onGlobalHotkey.
		onGlobalHotkey = toggleMainWindow
		registerGlobalHotkey()

		// The red ✕ asks Go what to do (via the close-guard). Keep-in-tray on
		// (default) hides the window — sessions survive; off makes ✕ a real quit,
		// which still routes through ShouldQuit's confirmation.
		onCloseRequested = func() {
			if s, err := settingsService.Get(); err == nil && !s.KeepRunningInTray {
				application.Get().Quit()
				return
			}
			mainWindow.Hide()
		}
	})

	mainWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "SSH Manager",
		Width:     1200,
		Height:    760,
		MinWidth:  900,
		MinHeight: 560,
		Mac: application.MacWindow{
			// UI-06: frameless, but keep the traffic lights. The design puts
			// them in a title bar (TZ 12.1); the frontend sizes the visible
			// band (52px, tuned to where Tahoe draws the lights).
			TitleBar:                application.MacTitleBarHiddenInset,
			InvisibleTitleBarHeight: 52,
			// UI-02: the app is dark. Pin the window to the dark system
			// appearance so the OS-drawn chrome — notably the title bar macOS
			// reveals on a top-edge hover in fullscreen — is dark, not a light
			// panel over the graphite content.
			Appearance: application.NSAppearanceNameDarkAqua,
		},
		// bg0 from the graphite palette (TZ 12.1) — this is what shows before
		// the webview paints, so it must match or the window flashes.
		BackgroundColour: application.NewRGB(0x13, 0x16, 0x1b),
		URL:              "/",
	})

	// Remap the red close button to hide-to-tray. Done on WindowShow — it fires
	// once the native window and its traffic-light buttons exist (Application-
	// Started is too early, which is why an earlier attempt there did nothing) —
	// and is re-applied on every show so it survives Wails re-styling the button.
	mainWindow.OnWindowEvent(events.Common.WindowShow, func(*application.WindowEvent) {
		interceptCloseButton()
	})

	// Tray-lite: a menu-bar presence so the app is reachable while its window is
	// hidden (by ⌘⇧S or the close button). A text label (not an icon) is the
	// v0.4 identity — a proper template icon is v0.5 polish (docs/v0.5-notes.md).
	// Left-click toggles the window IN PLACE via toggleMainWindow — deliberately
	// NOT AttachWindow, whose built-in ToggleWindow repositions the window under
	// the menu-bar icon (wrong for a full-size window). Right-click shows the
	// menu below (Wails' smart default when a menu is set).
	tray := app.SystemTray.New()
	tray.SetLabel("SSH")
	tray.OnClick(func() { toggleMainWindow() })

	// The tray's server list mirrors the pinned set. rebuildTray refreshes it
	// from the live list; SetOnServersChanged (below) reruns it whenever a
	// server is pinned/renamed/deleted. Building it once here is the initial menu.
	rebuildTray := func() {
		servers, err := serverService.List()
		if err != nil {
			servers = nil // best-effort: an unreadable list just yields no pinned section
		}
		tray.SetMenu(buildTrayMenu(app, service.PinnedForTray(servers), func(id string) {
			showMainWindow()
			application.Get().Event.Emit("tray:connect", service.TrayConnect{ServerID: id})
		}))
	}
	rebuildTray() // initial build: setup-time, on the main thread — direct call is safe
	// Live rebuilds fire from the SetPinned/Update/Delete bound-method
	// goroutines, which run off the main thread after app.Run(). Mutating the
	// AppKit tray menu (tray.SetMenu) off the main thread can crash on macOS, so
	// marshal each live rebuild onto the main thread. InvokeAsync's
	// dispatchOnMainThread has an isOnMainThread fast path, so this stays cheap.
	service.SetOnServersChanged(serverService, func() {
		application.InvokeAsync(rebuildTray)
	})

	// Uninstall wipes the DB/keychain/log dirs and then must quit the app —
	// there is nothing left for the UI to show once the data is gone.
	service.SetOnUninstalled(uninstallService, func() { app.Quit() })

	// SEC-05 & NFR-04: this is what lets SQLite checkpoint the WAL back into
	// sshmgr.db and remove the "-wal"/"-shm" side files on a clean quit.
	// Measured, not assumed, that it has to be an OnShutdown hook and not
	// code placed after app.Run() returns: on macOS, Quit() (and the normal
	// Cmd+Q / red-button / Dock-menu quit, which all funnel through the same
	// path) calls destroyApp() -> [NSApp terminate:nil], and Cocoa's
	// terminate: does not return to the caller — it calls the delegate's
	// applicationShouldTerminate:, which runs OnShutdown's registered tasks
	// synchronously, and only then exits the process directly in C.
	// app.Run()'s underlying C.run() (`[NSApp run]`) never returns control to
	// Go at all. Confirmed with an instrumented build: a goroutine logging
	// before/after app.Quit() never got to print its "after" line, and a
	// deferred print placed right after app.Run() never printed either — the
	// process was gone. Before this fix, main() closed nothing on quit at
	// all, so the previous bug (the 0644 WAL from before store.Open's
	// ordering fix) was never checkpointed away by *any* code path, not even
	// occasionally.
	app.OnShutdown(func() {
		termMgr.CloseAll()
		if err := sqlDB.Close(); err != nil {
			logStartupFailure(fmt.Sprintf("cannot close the database cleanly: %v", err))
		}
	})

	if err := app.Run(); err != nil {
		logStartupFailure(fmt.Sprintf("application terminated: %v", err))
		log.Fatal(err)
	}
}

// toggleMainWindow hides the window if visible, otherwise shows and focuses it.
// Hide keeps the window (and its React state + live PTY sessions) alive, so
// ⌘⇧S is a hide-to-tray / summon, not a close.
func toggleMainWindow() {
	if mainWindow == nil {
		return
	}
	if mainWindow.IsVisible() {
		mainWindow.Hide()
	} else {
		showMainWindow()
	}
}

// showMainWindow brings the window back and focuses it (used by the tray's
// "Show" item and the show half of the toggle).
func showMainWindow() {
	if mainWindow == nil {
		return
	}
	mainWindow.Show()
	mainWindow.Focus()
}

// fatalStartup handles the one failure a real user actually hits: disk
// full, permissions broken by a restore, a corrupted database. The app
// ships as "SSH Manager.app" (build/darwin/Taskfile.yml's
// create:app:bundle); launched from Finder or the Dock, a GUI app's stderr
// goes to /dev/null or os_log, so the previous behaviour here —
// log.Fatalf — left zero trace: the Dock icon bounces once, the process
// exits 1, and the user sees nothing.
//
// Measured, not assumed, that application.New() alone does not make a
// dialog safe to show here: MessageDialog.Show() dispatches onto the
// native main-thread run loop via InvokeSync, and that loop does not exist
// until app.Run() sets App.impl up and starts pumping it. Calling Show()
// before Run() does not silently no-op — it panics with a nil-pointer
// dereference in dispatchOnMainThread. Deferring the Show() to the
// events.Common.ApplicationStarted hook, which only fires once Run() has
// done that setup, is what actually puts a dialog on screen; confirmed
// with a scratch program that the dialog appears and genuinely blocks on
// the user dismissing it.
//
// This always writes the log line first — the log never depends on the
// native dialog layer behaving — then makes a best-effort attempt to show
// the dialog too, and exits non-zero either way.
func fatalStartup(context string, err error) {
	msg := fmt.Sprintf("%s: %v", context, err)
	logStartupFailure(msg)

	dialogApp := application.New(application.Options{Name: "SSH Manager"})
	dialogApp.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		dialogApp.Dialog.Error().SetTitle("SSH Manager").SetMessage(msg).Show()
		dialogApp.Quit()
	})
	_ = dialogApp.Run()

	os.Exit(1)
}

// logStartupFailure best-effort logs msg to a file under platform.LogDir(),
// creating that folder 0700 — the log sits inside the data folder and must
// not be looser than it (SEC-05's spirit). A startup path error carries no
// secrets (SEC-06: host/user/key-path values never reach this function), so
// plain text is fine. Any failure here is not itself worth failing over —
// by the time this is called, the app is already exiting on a fatal error.
func logStartupFailure(msg string) {
	logDir, err := platform.LogDir()
	if err != nil {
		return
	}
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		return
	}
	// G302 wants 0600 or less, but it cannot tell a directory from a file —
	// it only sees os.Chmod. 0600 on a directory strips the execute bit that
	// permits traversal (verified: drw------- cannot be entered), so the log
	// folder must be 0700, matching the data folder it sits inside (SEC-05).
	if err := os.Chmod(logDir, 0o700); err != nil { //nolint:gosec // see above
		return
	}
	// G304 flags the variable, not a taint path. logDir is os.UserConfigDir()
	// plus the compile-time constant "SSHManager", joined here with a constant
	// filename; no caller-supplied path reaches it. To be precise rather than
	// glib: os.UserConfigDir() does read $HOME (or %AppData% on Windows), so
	// this is environment-derived. That is not a taint path for a local
	// desktop app reading its own config directory — anyone who can set your
	// HOME already owns the session.
	f, err := os.OpenFile(filepath.Join(logDir, "startup-error.log"), //nolint:gosec // see above
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return
	}
	// Best-effort by contract: the app is already exiting on a fatal error,
	// so a failure to write or close this log is not worth acting on. The
	// ignores are explicit rather than implicit.
	defer func() { _ = f.Close() }()
	_, _ = fmt.Fprintf(f, "%s %s\n", time.Now().Format(time.RFC3339), msg)
}

// appEmitter is the production service.Emitter: it emits through the global
// Wails app, looked up at call time so the prompter can be built before the
// app exists. It lives in package main because application is cgo-gated and
// must not be imported by internal/service (which builds CGO_ENABLED=0).
type appEmitter struct{}

func (appEmitter) Emit(name string, data ...any) bool {
	return application.Get().Event.Emit(name, data...)
}

// Register the hostkey:request event once, with a constant name and the
// concrete service.HostKeyRequest type. Registering here (package main)
// rather than in internal/service keeps the service package cgo-free; the
// binding generator still discovers this call by AST-scanning the module.
// Placed in an init so it runs before app setup and before the generator's
// static analysis reasons about it.
func init() {
	application.RegisterEvent[service.HostKeyRequest]("hostkey:request")
	application.RegisterEvent[service.CodeRequest]("code:request")
	application.RegisterEvent[term.Output]("term:data")
	application.RegisterEvent[term.State]("session:state")
	application.RegisterEvent[forward.Status]("forward:status")
	application.RegisterEvent[service.TrayConnect]("tray:connect")
	application.RegisterEvent[service.SftpProgress]("sftp:progress")
}
