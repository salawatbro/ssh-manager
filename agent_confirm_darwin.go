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
	"context"
	"time"
	"unsafe"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/platform"
)

// agentConfirmer asks the user to approve one agent signature: Touch ID or
// the macOS password through LocalAuthentication.
type agentConfirmer struct{}

func (agentConfirmer) Confirm(ctx context.Context, req agent.ConfirmRequest) (bool, error) {
	reason := agent.ConfirmReason(req)
	secs := int(time.Until(deadlineOf(ctx)).Seconds())
	if secs < 1 {
		return false, ctx.Err()
	}
	// An unsigned dev build cannot present LocalAuthentication; it gets a
	// plain dialog, but never while the app is locked.
	if !platform.RunningFromAppBundle() && !req.Locked {
		return devConfirmDialog(ctx, reason)
	}
	cs := C.CString(reason)
	defer C.free(unsafe.Pointer(cs))
	return C.sshmgrDeviceOwnerAuthenticate(cs, C.int(secs)) == 1, nil
}

func deadlineOf(ctx context.Context) time.Time {
	if d, ok := ctx.Deadline(); ok {
		return d
	}
	return time.Now().Add(agent.ConfirmTimeout)
}
