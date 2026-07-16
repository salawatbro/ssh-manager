//go:build darwin

package main

/*
#cgo LDFLAGS: -framework Carbon
#include "hotkey_darwin.h"
*/
import "C"

// goGlobalHotkeyFired is invoked from the Carbon hot-key handler (C) on every
// ⌘⇧S press, anywhere. It runs the toggle in a goroutine so it neither blocks
// the Carbon handler nor calls a Wails window method inline on the run-loop
// thread (Wails marshals window calls to the main thread itself).
//
//export goGlobalHotkeyFired
func goGlobalHotkeyFired() {
	if onGlobalHotkey != nil {
		go onGlobalHotkey()
	}
}

// registerGlobalHotkey installs the ⌘⇧S system-wide hot key (macOS). Call after
// NSApp exists (the ApplicationStarted hook), like forceDarkAppearance.
func registerGlobalHotkey() { C.sshmgrRegisterGlobalHotkey() }
