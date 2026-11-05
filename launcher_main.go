package main

import (
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/service"
)

// The launcher keeps one size: a window that grew with its rows would move
// its top edge on every keystroke (SetSize keeps the bottom-left corner).
const (
	launcherWidth  = 560
	launcherHeight = 364
	// Matches the page's rounded-[18px] frame.
	launcherRadius = 18
)

// launcherWindow is the ⌥Space window. It is created hidden at start so its
// page is loaded by the first press.
var launcherWindow atomic.Pointer[application.WebviewWindow]

func createLauncherWindow(app *application.App) {
	w := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:            "launcher",
		Title:           "Zish launcher",
		Width:           launcherWidth,
		Height:          launcherHeight,
		Hidden:          true,
		Frameless:       true,
		DisableResize:   true,
		AlwaysOnTop:     true,
		InitialPosition: application.WindowCentered,
		URL:             "/launcher.html",
		Mac: application.MacWindow{
			// Non-activating, like the approval panel: it takes the keyboard
			// without bringing the main window over the app in front.
			WindowClass:      application.MacWindowClassPanel,
			PanelPreferences: application.MacPanelPreferences{FloatingPanel: true, NonActivating: true},
			CollectionBehavior: application.MacWindowCollectionBehaviorCanJoinAllSpaces |
				application.MacWindowCollectionBehaviorFullScreenAuxiliary,
			// An opaque window would fill the rounded corners back in.
			Backdrop:     application.MacBackdropTransparent,
			CornerRadius: launcherRadius,
		},
	})
	launcherWindow.Store(w)
}

// toggleLauncher shows the launcher over whatever app is in front, or hides
// it when it is already up.
func toggleLauncher() {
	w := launcherWindow.Load()
	if w == nil {
		return
	}
	application.InvokeAsync(func() {
		if w.IsVisible() {
			w.Hide()
			return
		}
		application.Get().Event.Emit("launcher:show")
		w.Center()
		w.Show()
		w.Focus()
	})
}

// syncLauncherHotkey registers the launcher's shortcut, then the stacks'
// again, since a stack the old shortcut blocked may be free now. Main thread
// only.
func syncLauncherHotkey(sc string, stacks *service.StackService) {
	launcherKey.set(sc)
	syncStackHotkeys(stacks)
}

// LauncherWindowService is what the launcher window needs from package main:
// connecting and launching in a way the main window hears about, and the main
// window itself. Bound to the frontend as LauncherWindowService.
type LauncherWindowService struct {
	launcher *service.LauncherService
	stacks   *service.StackService
}

// Connect opens a server through LauncherService, like the main window's
// Connect; inTab is the launcher's ⌘↵. The main window reloads its list on
// servers:changed: last used moved, or a quick connect saved a new server
// just before (which stays saved even when the terminal fails to open).
func (s *LauncherWindowService) Connect(serverID string, inTab bool) (service.OpenResult, error) {
	open := s.launcher.Open
	if inTab {
		open = s.launcher.OpenInTab
	}
	res, err := open(serverID)
	application.Get().Event.Emit("servers:changed", serverID)
	return res, err
}

// LaunchStack launches a stack and reports it on stack:launched, as the tray
// does, without bringing the main window forward.
func (s *LauncherWindowService) LaunchStack(id string) (service.StackLaunch, error) {
	res, err := s.stacks.Launch(id)
	ev := service.StackLaunched{StackID: id, Result: res}
	if err != nil {
		ev.Error = err.Error()
	}
	application.Get().Event.Emit("stack:launched", ev)
	return res, err
}

// ShowMain brings the main window forward, e.g. to unlock with the PIN.
func (s *LauncherWindowService) ShowMain() {
	application.InvokeAsync(showMainWindow)
}

// HotkeyTaken reports whether another app holds the launcher's shortcut.
func (s *LauncherWindowService) HotkeyTaken() bool {
	_, taken := launcherKey.state()
	return taken
}
