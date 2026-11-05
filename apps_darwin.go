//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework AppKit
#include <stdlib.h>
#include "apps_native.h"
*/
import "C"

import (
	"unsafe"

	"github.com/salawat/sshmgr/internal/launcher"
)

// nsAppLocator finds terminal apps through LaunchServices (NSWorkspace), so
// apps outside /Applications are found too.
type nsAppLocator struct{}

func newAppLocator() launcher.AppLocator { return nsAppLocator{} }

func (nsAppLocator) Locate(bundleID string) (launcher.AppInfo, bool) {
	cs := C.CString(bundleID)
	defer C.free(unsafe.Pointer(cs))
	var path, version *C.char
	if C.sshmgrLocateApp(cs, &path, &version) == 0 {
		return launcher.AppInfo{}, false
	}
	defer C.free(unsafe.Pointer(path))
	defer C.free(unsafe.Pointer(version))
	return launcher.AppInfo{Path: C.GoString(path), Version: C.GoString(version)}, true
}
