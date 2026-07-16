//go:build !darwin

package main

// forceDarkAppearance is a no-op off macOS: the app-wide dark appearance is a
// Cocoa concern. On Windows the webview content carries the dark theme and
// there is no equivalent NSApp appearance to pin.
func forceDarkAppearance() {}
