//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#include <stdbool.h>

// Regular puts Zish in the Dock and ⌘Tab; accessory leaves only the menu-bar
// icon, and its panels still open. macOS ties the Dock and ⌘Tab together.
static void zishSetDockPresence(bool visible) {
	if (NSApp == nil) {
		return;
	}
	NSApplicationActivationPolicy want = visible
		? NSApplicationActivationPolicyRegular
		: NSApplicationActivationPolicyAccessory;
	if (NSApp.activationPolicy != want) {
		[NSApp setActivationPolicy:want];
	}
}
*/
import "C"

// setDockPresence shows or drops Zish's Dock icon and ⌘Tab entry. Main thread
// only.
func setDockPresence(visible bool) { C.zishSetDockPresence(C.bool(visible)) }
