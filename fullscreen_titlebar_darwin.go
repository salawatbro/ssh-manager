//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#include <stdbool.h>

// The fullscreen reveal shows the title bar with nothing behind it, so the
// transparent title bar reads as a white band: paint it with the window colour
// and drop the inset toolbar (it only makes the band taller) while fullscreen.
// Both are undone on exit so the windowed title band stays transparent.
static void zishSetFullscreenTitlebar(bool fullscreen) {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSWindow *main = nil;
		for (NSWindow *w in [NSApp windows]) {
			if ([[w title] isEqualToString:@"Zish"]) {
				main = w;
				break;
			}
		}
		NSView *titlebar = [[main standardWindowButton:NSWindowCloseButton] superview];
		if (titlebar == nil) {
			return;
		}
		titlebar.wantsLayer = YES;
		titlebar.layer.backgroundColor = fullscreen ? main.backgroundColor.CGColor : NULL;
		main.toolbar.visible = !fullscreen;
	});
}
*/
import "C"

// fullscreenTitlebarChanged keeps the fullscreen title-bar reveal dark and slim (macOS only).
func fullscreenTitlebarChanged(fullscreen bool) {
	C.zishSetFullscreenTitlebar(C.bool(fullscreen))
}
