package service

import (
	"strings"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
)

func feed(a *tunnelAlerts, states ...forward.State) []alertKind {
	var got []alertKind
	for _, st := range states {
		got = append(got, a.next(forward.Status{ForwardID: "f1", State: st}))
	}
	return got
}

func TestTunnelAlertsFollowADropAndItsReconnect(t *testing.T) {
	var a tunnelAlerts
	got := feed(&a, forward.StateRunning, forward.StateError, forward.StateRetrying, forward.StateRetrying, forward.StateRunning)
	want := []alertKind{alertNone, alertDropped, alertNone, alertNone, alertReconnected}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("step %d: got %v, want %v", i, got, want)
		}
	}
}

func TestTunnelAlertsStayQuietOnStartStopAndLock(t *testing.T) {
	var a tunnelAlerts
	for i, k := range feed(&a, forward.StateRunning, forward.StateStopped, forward.StateRunning, forward.StateStopped) {
		if k != alertNone {
			t.Fatalf("step %d alerted %v", i, k)
		}
	}
	// A start that fails for a reason other than a busy port is the user's to
	// see in the window, not a drop.
	if k := feed(&a, forward.StateError); k[0] != alertNone {
		t.Fatalf("failed start alerted %v", k[0])
	}
}

func TestTunnelAlertsManualStartWhileRetryingIsNoReconnect(t *testing.T) {
	var a tunnelAlerts
	got := feed(&a, forward.StateRunning, forward.StateError, forward.StateRetrying, forward.StateStopped, forward.StateRunning)
	if got[4] != alertNone {
		t.Fatalf("restart after a manual stop alerted %v", got[4])
	}
}

func TestTunnelAlertsGiveUpAndBusyPort(t *testing.T) {
	var a tunnelAlerts
	got := feed(&a, forward.StateRunning, forward.StateError, forward.StateRetrying, forward.StateError)
	if got[3] != alertGaveUp {
		t.Fatalf("retrying → error = %v, want gave up", got[3])
	}
	busy := a.next(forward.Status{ForwardID: "f2", State: forward.StateError, PortBusy: true})
	if busy != alertPortBusy {
		t.Fatalf("busy port = %v, want port busy", busy)
	}
}

func TestTunnelAlertText(t *testing.T) {
	fwd := &domain.PortForward{ID: "f1", Name: "pg", BindPort: 5432}
	drop := tunnelAlert(alertDropped, fwd, "The server stopped answering.", "", true)
	if drop.ID != "tunnel-f1" || !strings.Contains(drop.Title, "pg") || !strings.HasSuffix(drop.Body, "Zish is reconnecting.") {
		t.Fatalf("drop alert = %+v", drop)
	}
	back := tunnelAlert(alertReconnected, fwd, "", "db-prod", false)
	if back.ID != drop.ID || back.Body != "Reconnected to db-prod." {
		t.Fatalf("reconnect alert = %+v", back)
	}
	busy := tunnelAlert(alertPortBusy, fwd, "", "", false)
	if !strings.Contains(busy.Body, "5432") {
		t.Fatalf("busy alert = %+v", busy)
	}
}

type alertSink chan TunnelAlert

func (s alertSink) NotifyTunnel(a TunnelAlert) { s <- a }

func TestObserveForwardSendsADropAlert(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "db-prod", nil)
	fwd, err := svc.Create(validForwardInput(srv.ID))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	sink := make(alertSink, 4)
	SetTunnelNotifier(svc, sink)

	ObserveForward(svc, forward.Status{ForwardID: fwd.ID, State: forward.StateRunning})
	ObserveForward(svc, forward.Status{ForwardID: fwd.ID, State: forward.StateError, Detail: "The connection to the server closed."})
	select {
	case a := <-sink:
		if !strings.Contains(a.Title, fwd.Name) || !strings.Contains(a.Body, "closed") {
			t.Fatalf("alert = %+v", a)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no alert for a drop")
	}
}
