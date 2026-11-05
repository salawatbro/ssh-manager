//go:build !darwin

package main

// watchAwayFromMac is macOS-only; elsewhere the idle timer and ⌘L lock Zish.
func watchAwayFromMac(func()) {}
