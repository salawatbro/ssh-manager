//go:build darwin

package main

/*
#cgo LDFLAGS: -framework CoreGraphics -framework CoreFoundation
#include <CoreGraphics/CoreGraphics.h>

// 1 while the login window covers the screen (or there is no GUI session):
// a window shown then would never be seen.
static int sshmgrScreenLocked(void) {
	CFDictionaryRef d = CGSessionCopyCurrentDictionary();
	if (d == NULL) {
		return 1;
	}
	int locked = 0;
	CFTypeRef v = CFDictionaryGetValue(d, CFSTR("CGSSessionScreenIsLocked"));
	if (v != NULL && CFGetTypeID(v) == CFBooleanGetTypeID() && CFBooleanGetValue((CFBooleanRef)v)) {
		locked = 1;
	}
	CFRelease(d);
	return locked;
}
*/
import "C"

import (
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// approvalWindow is the small floating panel that asks before an agent key
// signs. A non-activating panel takes the keyboard without bringing Zish's
// main window over the terminal that asked.
var approvalWindow atomic.Pointer[application.WebviewWindow]

func createApprovalWindow(app *application.App, background application.RGBA) {
	w := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "approval",
		Title:            "Zish approval",
		Width:            380,
		Height:           420,
		Hidden:           true,
		Frameless:        true,
		DisableResize:    true,
		AlwaysOnTop:      true,
		InitialPosition:  application.WindowCentered,
		BackgroundColour: background,
		URL:              "/approval.html",
		Mac: application.MacWindow{
			WindowClass:      application.MacWindowClassPanel,
			PanelPreferences: application.MacPanelPreferences{FloatingPanel: true, NonActivating: true},
			CollectionBehavior: application.MacWindowCollectionBehaviorCanJoinAllSpaces |
				application.MacWindowCollectionBehaviorFullScreenAuxiliary,
			CornerRadius: 16,
		},
	})
	approvalWindow.Store(w)
}

// showApprovalWindow puts the panel on screen; false when nothing could be
// seen, so the confirmer goes straight to the system sheet.
func showApprovalWindow() bool {
	w := approvalWindow.Load()
	if w == nil || C.sshmgrScreenLocked() == 1 {
		return false
	}
	application.InvokeAsync(func() {
		w.Center()
		w.Show()
		w.Focus()
	})
	return true
}

func hideApprovalWindow() {
	if w := approvalWindow.Load(); w != nil {
		application.InvokeAsync(func() { w.Hide() })
	}
}
