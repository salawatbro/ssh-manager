//go:build !darwin

package main

// fullscreenTitlebarChanged is a no-op off macOS: the fullscreen title-bar
// reveal is a Cocoa concern.
func fullscreenTitlebarChanged(bool) {}
