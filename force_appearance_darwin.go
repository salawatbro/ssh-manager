//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

static void forceDarkAppearance(void) {
	// Pin the whole application to the dark system appearance so a Mac set to
	// Light mode still renders the app's OS-drawn chrome — the menu bar, the
	// title bar macOS reveals on a top-edge hover in fullscreen, native
	// dialogs, scrollbars — dark, to match the graphite UI (UI-02: the app is
	// dark). Wails only sets the *window* appearance (MacWindow.Appearance);
	// the menu bar and fullscreen reveal follow NSApp's appearance, which
	// there is no Wails option for — hence this native set. Runs on
	// ApplicationStarted, after NSApp exists.
	if (NSApp != nil) {
		NSApp.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
	}
}
*/
import "C"

// forceDarkAppearance pins NSApp to the dark appearance (macOS only).
func forceDarkAppearance() {
	C.forceDarkAppearance()
}
