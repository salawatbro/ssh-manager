//go:build !darwin

package main

// watchNetwork is macOS-only for now; elsewhere tunnels rely on keep-alive.
func watchNetwork(func(up bool)) {}
