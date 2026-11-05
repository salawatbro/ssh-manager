package main

import (
	_ "embed"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed build/darwin/tray_template.png
var trayTemplateIcon []byte

const (
	trayPanelWidth = 340
	// The page measures itself and calls Fit; this is only the first frame.
	trayPanelHeight    = 420
	trayPanelMinHeight = 120
	trayPanelMaxHeight = 640
	// Matches the page's rounded-[14px] frame.
	trayPanelRadius = 14
	trayPanelOffset = 4
	// Clicking the menu-bar icon while the panel is open first blurs the
	// panel, which hides it; that same click must not show it again.
	trayReopenGuard = 300 * time.Millisecond
)

var (
	trayPanel      atomic.Pointer[application.WebviewWindow]
	systemTray     atomic.Pointer[application.SystemTray]
	trayPanelHidAt atomic.Int64
)

// setupTray puts the bolt in the menu bar; a click on it opens the panel
// (tray.html) under it instead of a native menu.
func setupTray(app *application.App) {
	tray := app.SystemTray.New()
	tray.SetTemplateIcon(trayTemplateIcon)
	tray.SetTooltip("Zish")
	tray.OnClick(toggleTrayPanel)
	tray.OnRightClick(toggleTrayPanel)
	systemTray.Store(tray)

	w := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:          "tray",
		Title:         "Zish menu",
		Width:         trayPanelWidth,
		Height:        trayPanelHeight,
		Hidden:        true,
		Frameless:     true,
		DisableResize: true,
		AlwaysOnTop:   true,
		URL:           "/tray.html",
		Mac: application.MacWindow{
			// Non-activating, like the launcher: it takes the keyboard without
			// bringing the main window over the app in front.
			WindowClass:      application.MacWindowClassPanel,
			PanelPreferences: application.MacPanelPreferences{FloatingPanel: true, NonActivating: true},
			CollectionBehavior: application.MacWindowCollectionBehaviorCanJoinAllSpaces |
				application.MacWindowCollectionBehaviorFullScreenAuxiliary,
			// An opaque window would fill the rounded corners back in.
			Backdrop:     application.MacBackdropTransparent,
			CornerRadius: trayPanelRadius,
		},
	})
	trayPanel.Store(w)
}

func toggleTrayPanel() {
	application.InvokeAsync(func() {
		w := trayPanel.Load()
		if w == nil {
			return
		}
		if w.IsVisible() {
			hideTrayPanel()
			return
		}
		if time.Since(time.Unix(0, trayPanelHidAt.Load())) < trayReopenGuard {
			return
		}
		showTrayPanel()
	})
}

// showTrayPanel asks the page to read its lists again, then shows the panel
// under the icon. Main thread only.
func showTrayPanel() {
	w, tray := trayPanel.Load(), systemTray.Load()
	if w == nil || tray == nil {
		return
	}
	application.Get().Event.Emit("tray:show")
	_ = tray.PositionWindow(w, trayPanelOffset)
	w.Show()
	w.Focus()
}

// hideTrayPanel hides the panel. Main thread only.
func hideTrayPanel() {
	if w := trayPanel.Load(); w != nil && w.IsVisible() {
		trayPanelHidAt.Store(time.Now().UnixNano())
		w.Hide()
	}
}

func clampTrayHeight(h int) int {
	return min(max(h, trayPanelMinHeight), trayPanelMaxHeight)
}

// TrayPanelService is what the menu-bar panel needs from package main.
// Connecting, launching and tunnels go through the same services the
// launcher uses. Bound to the frontend as TrayPanelService.
type TrayPanelService struct{}

// Hide hides the panel (Esc, a blur, or before an action leaves it).
func (TrayPanelService) Hide() { application.InvokeAsync(hideTrayPanel) }

// Fit makes the panel as tall as its page, keeping its top edge under the
// menu bar.
func (TrayPanelService) Fit(height int) {
	h := clampTrayHeight(height)
	application.InvokeAsync(func() {
		if w := trayPanel.Load(); w != nil {
			fitTrayPanel(w, h)
		}
	})
}

// OpenMain brings the main window forward.
func (TrayPanelService) OpenMain() {
	application.InvokeAsync(func() {
		hideTrayPanel()
		showMainWindow()
	})
}

// OpenSettings shows the main window on its settings page.
func (TrayPanelService) OpenSettings() {
	application.InvokeAsync(func() {
		hideTrayPanel()
		showMainWindow()
		application.Get().Event.Emit("settings:open")
	})
}

// OpenLauncher swaps the panel for the ⌥Space launcher.
func (TrayPanelService) OpenLauncher() {
	application.InvokeAsync(func() {
		hideTrayPanel()
		if w := launcherWindow.Load(); w != nil && !w.IsVisible() {
			toggleLauncher()
		}
	})
}

// Quit quits Zish, as the app menu's Quit does. The panel goes first so it
// does not cover the question about running tunnels.
func (TrayPanelService) Quit() {
	application.InvokeSync(hideTrayPanel)
	application.Get().Quit()
}
