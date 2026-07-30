//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework LocalAuthentication
#include <stdlib.h>
#include "biometric_native.h"
*/
import "C"

import (
	"unsafe"

	"github.com/salawat/sshmgr/internal/platform"
)

// BiometricService exposes macOS Touch ID to the frontend. It lives in package
// main because it needs cgo, which the project keeps out of internal/.
type BiometricService struct{}

// NewBiometricService returns the service. It holds no state.
func NewBiometricService() *BiometricService { return &BiometricService{} }

// Available reports whether Touch ID can be used to unlock. Gated on running
// from a packaged .app: an unsigned `wails3 dev` binary cannot present the
// LocalAuthentication prompt, so we report false there and the UI falls back
// to PIN-only rather than showing a Touch ID button that always fails.
func (s *BiometricService) Available() bool {
	if !platform.RunningFromAppBundle() {
		return false
	}
	return C.sshmgrBiometricAvailable() == 1
}

// Authenticate presents the Touch ID prompt and blocks until the user
// responds. Returns true on success. On success the frontend simply unlocks —
// Touch ID is a convenience gate over the mandatory PIN.
func (s *BiometricService) Authenticate(reason string) bool {
	cs := C.CString(reason)
	defer C.free(unsafe.Pointer(cs))
	return C.sshmgrBiometricAuthenticate(cs) == 1
}
