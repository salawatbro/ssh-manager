package main

import (
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/service"
)

// launchStackNative launches a stack from the tray or a global shortcut and
// tells the window how it went; a failure brings the window up to show it.
func launchStackNative(stacks *service.StackService, id string) {
	res, err := stacks.Launch(id)
	ev := service.StackLaunched{StackID: id, Result: res}
	if err != nil {
		ev.Error = err.Error()
		showMainWindow()
	}
	_ = application.Get().Event.Emit("stack:launched", ev)
}

// syncStackHotkeys registers the stacks' global shortcuts; the launcher's
// shortcut wins a clash. Main thread only.
func syncStackHotkeys(stacks *service.StackService) {
	list, err := stacks.List()
	if err != nil {
		return
	}
	reserved, _ := launcherKey.state()
	for _, name := range stackKeys.sync(list, reserved) {
		log.Printf("the global shortcut of the stack %q is taken by another app", name)
	}
}
