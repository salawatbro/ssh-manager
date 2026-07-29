//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#include "edit_native.h"
*/
import "C"

// EditService exposes the platform's own edit actions to the frontend.
//
// It lives in package main because it needs cgo, which this project keeps out
// of internal/ entirely (the gate builds internal/... with CGO_ENABLED=0).
type EditService struct{}

// NewEditService returns the service. It holds no state — the actions it
// performs are the window's, not the app's.
func NewEditService() *EditService { return &EditService{} }

// Paste performs AppKit's standard paste: action.
//
// The terminal's right-click Paste calls this instead of reading the clipboard
// itself: since macOS 15 a programmatic NSPasteboard read is gated behind a
// confirmation button the user has to click, while a real paste command
// travelling the responder chain is not. Cmd+V needs none of this — WebKit
// already handles that natively.
func (s *EditService) Paste() { C.sshmgrSendPaste() }
