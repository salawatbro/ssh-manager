//go:build !darwin

package main

// interceptCloseButton is a no-op off macOS. The close→hide-to-tray behaviour is
// wired for Windows/Linux when those platforms get their manual pass.
func interceptCloseButton() {}
