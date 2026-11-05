package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/domain"
)

// trayMenu is what the menu-bar menu lists besides Show and Quit: pinned
// servers (already filtered and capped by service.PinnedForTray) and the
// stacks shown in the menu bar, each with the action its click runs.
type trayMenu struct {
	pinned  []domain.Server
	stacks  []domain.Stack
	connect func(serverID string)
	launch  func(stackID string)
}

// buildTrayMenu assembles the menu-bar menu: Show, the pinned servers, the
// stacks, then Quit. An empty section is left out with its separator.
func buildTrayMenu(app *application.App, m trayMenu) *application.Menu {
	menu := app.NewMenu()
	menu.Add("Show Zish").OnClick(func(*application.Context) { showMainWindow() })
	if len(m.pinned) > 0 {
		menu.AddSeparator()
		for _, srv := range m.pinned {
			id := srv.ID
			menu.Add("📌 " + srv.Name).OnClick(func(*application.Context) { m.connect(id) })
		}
	}
	if stacks := trayStacks(m.stacks); len(stacks) > 0 {
		menu.AddSeparator()
		menu.AddSectionHeader("Stacks")
		for _, st := range stacks {
			id := st.ID
			item := menu.Add(st.Name).OnClick(func(*application.Context) { m.launch(id) })
			if st.Shortcut != "" {
				item.SetAccelerator(st.Shortcut)
			}
		}
	}
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(*application.Context) { app.Quit() })
	return menu
}

// trayStacks keeps the stacks shown in the menu bar that have something to open.
func trayStacks(all []domain.Stack) []domain.Stack {
	var out []domain.Stack
	for _, st := range all {
		if st.InMenuBar && len(st.Steps) > 0 {
			out = append(out, st)
		}
	}
	return out
}
