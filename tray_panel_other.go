//go:build !darwin

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func fitTrayPanel(w *application.WebviewWindow, height int) {
	w.SetSize(trayPanelWidth, height)
}
