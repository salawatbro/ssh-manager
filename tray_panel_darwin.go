//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

// setFrame keeps the bottom-left corner, which would drop the panel's top
// edge away from the menu bar; resize from the top instead.
static void zishFitPanelHeight(void *win, double height) {
	NSWindow *w = (NSWindow *)win;
	NSRect f = [w frame];
	CGFloat top = NSMaxY(f);
	f.size.height = height;
	f.origin.y = top - height;
	[w setFrame:f display:YES animate:NO];
	[w invalidateShadow];
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

// fitTrayPanel sets the panel's height, keeping its top edge. Main thread only.
func fitTrayPanel(w *application.WebviewWindow, height int) {
	if p := w.NativeWindow(); p != nil {
		C.zishFitPanelHeight(p, C.double(height))
	}
}
