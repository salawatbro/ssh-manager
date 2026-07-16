//go:build !darwin

package main

// registerGlobalHotkey is a no-op off macOS. A Windows system-wide hot key
// (Win32 RegisterHotKey) is a follow-up recorded in docs/v0.5-notes.md.
func registerGlobalHotkey() {}
