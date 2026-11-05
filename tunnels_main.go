package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/salawat/sshmgr/internal/service"
)

// startTunnels runs the tunnel runtime once the app is up: auto-start, the
// forward:stats ticker, and reconnects on wake and on network changes. Wails
// already observes NSWorkspace sleep/wake; the network path needs our own
// monitor (netwatch_darwin.go). It returns a stop for the ticker.
func startTunnels(app *application.App, fs *service.ForwardService, gate *service.LockGate) (stop func()) {
	app.Event.OnApplicationEvent(events.Common.SystemDidWake, func(*application.ApplicationEvent) {
		go service.TunnelsWoke(fs)
	})
	watchNetwork(func(up bool) { service.TunnelsNetworkChanged(fs, up) })
	return service.StartTunnelRuntime(fs, gate, appEmitter{})
}
