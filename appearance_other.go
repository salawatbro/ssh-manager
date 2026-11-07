//go:build !darwin

package main

// The app-wide appearance is a Cocoa concern; elsewhere the page carries the
// theme on its own.
func systemIsDark() bool { return true }

func applyTheme(string) {}

func systemAppearanceChanged() {}
