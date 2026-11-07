//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework Network
#include "netwatch_native.h"
*/
import "C"

import "sync/atomic"

var onNetworkChanged atomic.Pointer[func(up bool)]

// goNetworkChanged is called from the network monitor's dispatch queue.
//
//export goNetworkChanged
func goNetworkChanged(up C.int) {
	if fn := onNetworkChanged.Load(); fn != nil {
		go (*fn)(up != 0)
	}
}

// watchNetwork calls fn on every change of the Mac's network path (Wi-Fi
// joined or left, a cable plugged, a new gateway), through Network.framework.
func watchNetwork(fn func(up bool)) {
	onNetworkChanged.Store(&fn)
	C.sshmgrStartNetworkWatch()
}
