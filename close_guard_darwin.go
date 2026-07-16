//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#include "close_guard.h"
*/
import "C"

// goCloseRequested is invoked from the red close button (C). It runs the Go
// decision in a goroutine so Wails can marshal Hide/Quit to the main thread.
//
//export goCloseRequested
func goCloseRequested() {
	if onCloseRequested != nil {
		go onCloseRequested()
	}
}

// interceptCloseButton remaps the red close button to the Go callback (macOS).
// Idempotent; called on every WindowShow so it lands once the button exists.
func interceptCloseButton() { C.sshmgrInterceptCloseButton() }
