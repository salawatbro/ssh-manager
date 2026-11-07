package main

import (
	"context"
	"log"
	"sync"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/service"
)

// macNotifier shows tunnel alerts as macOS notifications. The notification
// calls block for seconds, so each send runs on its own goroutine.
type macNotifier struct {
	once  sync.Once
	ns    *notifications.NotificationService
	ready bool
	// inFront is true while the main window is key: the user sees the tunnel
	// there, so a notification would only repeat it.
	inFront atomic.Bool
}

// start sets up the notification center once. Without an app bundle there is
// no bundle id, and UNUserNotificationCenter aborts the process.
func (n *macNotifier) start() bool {
	n.once.Do(func() {
		if !platform.RunningFromAppBundle() {
			return
		}
		ns := notifications.New()
		if err := ns.ServiceStartup(context.Background(), application.ServiceOptions{}); err != nil {
			log.Printf("notifications unavailable: %v", err)
			return
		}
		ns.OnNotificationResponse(func(notifications.NotificationResult) {
			application.InvokeAsync(showMainWindow)
		})
		n.ns, n.ready = ns, true
	})
	return n.ready
}

// authorize asks macOS for permission the first time; later it only reads
// the answer the user gave.
func (n *macNotifier) authorize() bool {
	if !n.start() {
		return false
	}
	if ok, err := n.ns.CheckNotificationAuthorization(); err == nil && ok {
		return true
	}
	ok, err := n.ns.RequestNotificationAuthorization()
	return err == nil && ok
}

func (n *macNotifier) NotifyTunnel(a service.TunnelAlert) {
	if n.inFront.Load() {
		return
	}
	go func() {
		if !n.authorize() {
			return
		}
		err := n.ns.SendNotification(notifications.NotificationOptions{
			ID:       a.ID,
			Title:    a.Title,
			Body:     a.Body,
			ThreadID: "tunnels",
		})
		if err != nil {
			log.Printf("tunnel notification: %v", err)
		}
	}()
}
