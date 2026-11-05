//go:build darwin

package main

/*
#cgo LDFLAGS: -framework Carbon
#include "hotkey_darwin.h"
*/
import "C"

// goHotkeyFired is invoked from the Carbon hot-key handler (C) on every press
// of a registered hot key, anywhere. The work runs in a goroutine so it never
// blocks the Carbon handler or calls a Wails window method inline on the
// run-loop thread.
//
//export goHotkeyFired
func goHotkeyFired(id C.int) {
	go hotkeyFired(int(id))
}

// registerGlobalHotkey installs the ⌘⇧S system-wide hot key (macOS). Call after
// NSApp exists (the ApplicationStarted hook), like applyTheme.
func registerGlobalHotkey() { C.sshmgrRegisterGlobalHotkey() }

// registerHotkey installs a system-wide hot key under id; false when Carbon
// refused it (usually another app holds the combination). Main thread only.
func registerHotkey(id int, key, mods uint32) bool {
	return C.sshmgrRegisterHotkey(C.int(id), C.int(key), C.int(mods)) == 0
}

func unregisterHotkey(id int) { C.sshmgrUnregisterHotkey(C.int(id)) }
