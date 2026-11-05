//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework AppKit -framework Foundation
#include "sleepwatch_native.h"
*/
import "C"

import "sync/atomic"

var onAwayFromMac atomic.Pointer[func()]

// goAwayFromMac is called from the notification observers on the posting
// thread, usually the main thread; the work runs off it.
//
//export goAwayFromMac
func goAwayFromMac() {
	if fn := onAwayFromMac.Load(); fn != nil {
		go (*fn)()
	}
}

// watchAwayFromMac calls fn when the Mac sleeps, its display sleeps, the
// screen locks or another user takes over the session.
func watchAwayFromMac(fn func()) {
	onAwayFromMac.Store(&fn)
	C.sshmgrStartSleepWatch()
}
