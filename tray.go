package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/domain"
)

// buildTrayMenu assembles the menu-bar menu: Show, then a section of pinned
// servers (each connects on click), then Quit. pinned is already filtered and
// capped by service.PinnedForTray. connect is called with a server id when a
// pinned entry is clicked; the wiring in main.go shows the window and asks the
// frontend to open or focus that server. When nothing is pinned the middle
// section (and its separators) is omitted, leaving the original Show/Quit menu.
func buildTrayMenu(app *application.App, pinned []domain.Server, connect func(id string)) *application.Menu {
	menu := app.NewMenu()
	menu.Add("Show Zish").OnClick(func(*application.Context) { showMainWindow() })
	if len(pinned) > 0 {
		menu.AddSeparator()
		for _, srv := range pinned {
			id := srv.ID // capture per iteration — the closure must not see the loop var
			menu.Add("📌 " + srv.Name).OnClick(func(*application.Context) { connect(id) })
		}
	}
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(*application.Context) { app.Quit() })
	return menu
}
