package service

import (
	"strconv"
	"sync"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
)

// TunnelAlert is one notification about a tunnel. Every alert for a tunnel
// shares its ID, so a newer one replaces the one before.
type TunnelAlert struct {
	ID    string
	Title string
	Body  string
}

// TunnelNotifier shows tunnel alerts; package main backs it with macOS
// notifications. NotifyTunnel must not block.
type TunnelNotifier interface {
	NotifyTunnel(a TunnelAlert)
}

// SetTunnelNotifier turns on alerts for Settings › Tunnels › "Notify me when
// a tunnel drops". Package-level so it never becomes a frontend binding.
func SetTunnelNotifier(s *ForwardService, n TunnelNotifier) { s.notifier = n }

type alertKind int

const (
	alertNone alertKind = iota
	alertDropped
	alertReconnected
	alertGaveUp
	alertPortBusy
)

// tunnelAlerts follows each tunnel's state to tell a drop and its reconnect
// from a start, a stop or a lock.
type tunnelAlerts struct {
	mu      sync.Mutex
	last    map[string]forward.State
	dropped map[string]bool
}

func (a *tunnelAlerts) next(st forward.Status) alertKind {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.last == nil {
		a.last = map[string]forward.State{}
		a.dropped = map[string]bool{}
	}
	id := st.ForwardID
	prev := a.last[id]
	a.last[id] = st.State
	switch st.State {
	case forward.StateRunning:
		if a.dropped[id] {
			delete(a.dropped, id)
			return alertReconnected
		}
	case forward.StateError:
		switch {
		case st.PortBusy:
			delete(a.dropped, id)
			return alertPortBusy
		case prev == forward.StateRunning:
			a.dropped[id] = true
			return alertDropped
		case prev == forward.StateRetrying:
			delete(a.dropped, id)
			return alertGaveUp
		}
	case forward.StateStopped:
		delete(a.dropped, id)
	}
	return alertNone
}

// alert runs inside the Manager's emit: only the bookkeeping happens here,
// the lookups and the notification on a goroutine.
func (s *ForwardService) alert(st forward.Status) {
	if s.notifier == nil {
		return
	}
	kind := s.alerts.next(st)
	if kind == alertNone {
		return
	}
	go func() {
		if !s.tunnelSettings().TunnelsNotify {
			return
		}
		fwd, err := s.repo.Get(st.ForwardID)
		if err != nil {
			return
		}
		via := ""
		if srv, err := s.servers.Get(fwd.ServerID); err == nil {
			via = srv.Name
		}
		reconnecting := kind == alertDropped && s.keeper.wants(fwd.ID)
		s.notifier.NotifyTunnel(tunnelAlert(kind, fwd, st.Detail, via, reconnecting))
	}()
}

func tunnelAlert(kind alertKind, fwd *domain.PortForward, detail, via string, reconnecting bool) TunnelAlert {
	a := TunnelAlert{ID: "tunnel-" + fwd.ID}
	name := "“" + fwd.Name + "”"
	switch kind {
	case alertDropped:
		a.Title = name + " tunnel dropped"
		a.Body = detail
		if reconnecting {
			a.Body = joinSentences(detail, "Zish is reconnecting.")
		}
	case alertReconnected:
		a.Title = name + " tunnel is back"
		a.Body = "Reconnected."
		if via != "" {
			a.Body = "Reconnected to " + via + "."
		}
	case alertGaveUp:
		a.Title = name + " tunnel stopped reconnecting"
		a.Body = detail
	case alertPortBusy:
		a.Title = name + " tunnel couldn’t start"
		a.Body = "Port " + strconv.Itoa(fwd.BindPort) + " is in use by another app. Open Zish to pick another port."
	}
	return a
}

func joinSentences(a, b string) string {
	if a == "" {
		return b
	}
	return a + " " + b
}
