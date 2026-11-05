//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#include <stdbool.h>

// Wails only sets a window's appearance at creation; the menu bar, menus,
// dialogs and the fullscreen title reveal follow NSApp's, which it has no
// option for. The windows keep a nil appearance so they inherit this one.
// AppKit only honours it on the main thread.
static void zishApplyAppearance(int mode) {
	dispatch_async(dispatch_get_main_queue(), ^{
		if (NSApp == nil) {
			return;
		}
		NSAppearance *a = nil;
		if (mode == 1) {
			a = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
		} else if (mode == 2) {
			a = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
		}
		NSApp.appearance = a;
	});
}

// Read from the defaults, not NSApp, so it works before the app runs and
// whatever appearance Zish itself has pinned.
static bool zishSystemIsDark(void) {
	@autoreleasepool {
		NSString *style = [[NSUserDefaults standardUserDefaults] stringForKey:@"AppleInterfaceStyle"];
		return style != nil && [style caseInsensitiveCompare:@"Dark"] == NSOrderedSame;
	}
}
*/
import "C"

import (
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var appliedTheme atomic.Value // string

func systemIsDark() bool { return bool(C.zishSystemIsDark()) }

// applyTheme makes NSApp's appearance and the windows' colours follow theme.
// Any thread; NSApp must exist for the appearance to land.
func applyTheme(theme string) {
	appliedTheme.Store(theme)
	C.zishApplyAppearance(C.int(appearanceFor(theme)))
	repaintWindows()
}

// systemAppearanceChanged repaints the windows when Zish follows macOS.
func systemAppearanceChanged() {
	if theme, _ := appliedTheme.Load().(string); appearanceFor(theme) == appearanceSystem {
		repaintWindows()
	}
}

func repaintWindows() {
	theme, _ := appliedTheme.Load().(string)
	main, panel := windowColours(themeIsDark(theme, systemIsDark()))
	application.InvokeAsync(func() {
		if mainWindow != nil {
			mainWindow.SetBackgroundColour(main)
			// The fullscreen band was painted with the old window colour.
			if mainWindow.IsFullscreen() {
				fullscreenTitlebarChanged(true)
			}
		}
		for _, w := range []*application.WebviewWindow{launcherWindow.Load(), approvalWindow.Load()} {
			if w != nil {
				w.SetBackgroundColour(panel)
			}
		}
	})
}
