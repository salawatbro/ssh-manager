package service

import (
	"path/filepath"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

type recordingEmitter struct {
	mu     sync.Mutex
	events []any
}

func (e *recordingEmitter) Emit(name string, data ...any) bool {
	if name != "forward:stats" || len(data) != 1 {
		return false
	}
	e.mu.Lock()
	e.events = append(e.events, data[0])
	e.mu.Unlock()
	return true
}

func (e *recordingEmitter) count() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.events)
}

func seedForward(t *testing.T, forwards *store.ForwardRepo, f domain.PortForward) {
	t.Helper()
	if f.Type == "" {
		f.Type, f.BindAddr, f.BindPort, f.DestHost, f.DestPort = domain.ForwardLocal, "127.0.0.1", 15432, "localhost", 5432
	}
	if err := forwards.Create(&f); err != nil {
		t.Fatal(err)
	}
}

func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func autoStartRig(t *testing.T, locked bool) (*fakeTunnelManager, *LockGate, func()) {
	t.Helper()
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &connReturningDialer{fakeDialer: &fakeDialer{}, conn: &sshx.Conn{}}, mgr)
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "auto", ServerID: srv.ID, Name: "pg", AutoStart: true})
	seedForward(t, forwards, domain.PortForward{ID: "manual", ServerID: srv.ID, Name: "redis"})
	gate := NewLockGate(locked)
	stop := StartTunnelRuntime(svc, gate, &recordingEmitter{})
	t.Cleanup(stop)
	return mgr, gate, stop
}

func TestAutoStartBringsUpOnlyAutoStartTunnels(t *testing.T) {
	mgr, _, _ := autoStartRig(t, false)
	waitFor(t, "the auto-start tunnel", func() bool { return len(mgr.startedIDs()) == 1 })
	time.Sleep(20 * time.Millisecond)
	if got := mgr.startedIDs(); !slices.Equal(got, []string{"auto"}) {
		t.Fatalf("started = %v, want only the auto-start tunnel", got)
	}
}

func TestAutoStartWaitsForUnlockAndRunsOnce(t *testing.T) {
	mgr, gate, _ := autoStartRig(t, true)
	time.Sleep(30 * time.Millisecond)
	if n := len(mgr.startedIDs()); n != 0 {
		t.Fatalf("started %d tunnels while locked", n)
	}
	gate.Unlock()
	waitFor(t, "auto-start after unlock", func() bool { return len(mgr.startedIDs()) == 1 })
	gate.Lock()
	if !gate.Locked() {
		t.Fatal("gate did not lock")
	}
	gate.Unlock()
	time.Sleep(30 * time.Millisecond)
	if n := len(mgr.startedIDs()); n != 1 {
		t.Fatalf("a second unlock auto-started again: %d starts", n)
	}
}

func TestTrafficTickerEmitsStats(t *testing.T) {
	mgr := &fakeTunnelManager{ticks: []forward.Traffic{{ForwardID: "f1", Buckets: make([]int64, 12), Total: 0}}}
	svc, _, _ := newForwardService(t, &fakeDialer{}, mgr)
	emit := &recordingEmitter{}
	stop := startTunnelRuntime(svc, NewLockGate(false), emit, 10*time.Millisecond)
	waitFor(t, "a forward:stats event", func() bool { return emit.count() >= 2 })
	stop()
	n := emit.count()
	time.Sleep(40 * time.Millisecond)
	if emit.count() != n {
		t.Fatal("the ticker kept emitting after stop")
	}
	if _, ok := emit.events[0].(forward.TrafficReport); !ok {
		t.Fatalf("payload = %T, want forward.TrafficReport", emit.events[0])
	}
}

func TestListAllCarriesServerNameStatusAndTraffic(t *testing.T) {
	mgr := &fakeTunnelManager{
		statuses: []forward.Status{{ForwardID: "a", State: forward.StateRunning}},
		ticks:    []forward.Traffic{{ForwardID: "a", Buckets: []int64{1, 2}, Total: 3}},
	}
	svc, forwards, servers := newForwardService(t, &fakeDialer{}, mgr)
	db := mkServer(t, servers, "db-primary", nil)
	nas := mkServer(t, servers, "nas", nil)
	seedForward(t, forwards, domain.PortForward{ID: "a", ServerID: db.ID, Name: "postgres"})
	seedForward(t, forwards, domain.PortForward{ID: "b", ServerID: nas.ID, Name: "DSM"})

	rows, err := svc.ListAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("ListAll = %d rows, want 2", len(rows))
	}
	byID := map[string]TunnelRow{}
	for _, r := range rows {
		byID[r.Forward.ID] = r
	}
	if r := byID["a"]; r.ServerName != "db-primary" || r.Status.State != forward.StateRunning || r.Traffic.Total != 3 {
		t.Fatalf("row a = %+v", r)
	}
	if r := byID["b"]; r.ServerName != "nas" || r.Status.State != forward.StateStopped || len(r.Traffic.Buckets) != forward.TrafficBuckets {
		t.Fatalf("row b = %+v, want stopped with an empty sparkline", r)
	}
}

func TestUsePortMovesTheListenerAndStarts(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &connReturningDialer{fakeDialer: &fakeDialer{}, conn: &sshx.Conn{}}, mgr)
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "redis", ServerID: srv.ID, Name: "redis", AutoStart: true, Reconnect: true})

	if err := svc.UsePort("redis", 6380); err != nil {
		t.Fatalf("UsePort: %v", err)
	}
	got, _ := forwards.Get("redis")
	if got.BindPort != 6380 || !got.AutoStart || !got.Reconnect {
		t.Fatalf("forward after UsePort = %+v, want port 6380 and its switches kept", got)
	}
	if mgr.startFwd.BindPort != 6380 {
		t.Fatalf("started on port %d, want 6380", mgr.startFwd.BindPort)
	}

	if err := svc.UsePort("redis", 70000); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("UsePort(70000) = %v, want a validation error", err)
	}
	seedForward(t, forwards, domain.PortForward{ID: "share", ServerID: srv.ID, Name: "share", Type: domain.ForwardRemote,
		BindAddr: "127.0.0.1", BindPort: 9000, DestHost: "localhost", DestPort: 3000})
	if err := svc.UsePort("share", 9001); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("UsePort on -R = %v, want a validation error", err)
	}
}

func TestStopCancelsAPendingReconnect(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &fakeDialer{dialErr: netDown}, mgr)
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "pg", ServerID: srv.ID, Name: "pg", Reconnect: true})
	clock := &manualClock{}
	svc.keeper.after = clock.after

	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateRunning})
	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateError, Detail: "lost"})
	if len(svc.keeper.waiting()) != 1 {
		t.Fatal("the drop was not queued for a reconnect")
	}

	svc.StopAll()
	if len(svc.keeper.waiting()) != 0 || len(clock.pending()) != 0 {
		t.Fatal("StopAll left the reconnect queued")
	}
	idle := mgr.idleReports()
	if last := idle[len(idle)-1]; last.State != forward.StateStopped {
		t.Fatalf("last idle report = %+v, want stopped", last)
	}
}

func TestWakeProbesAndRetriesNow(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &fakeDialer{dialErr: netDown}, mgr)
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "pg", ServerID: srv.ID, Name: "pg", Reconnect: true})
	clock := &manualClock{}
	svc.keeper.after = clock.after

	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateRunning})
	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateError})
	clock.fire()
	clock.fire()
	if got := clock.pending(); got[0] != 8*time.Second {
		t.Fatalf("pending = %v, want the back-off at 8s", got)
	}

	TunnelsWoke(svc)
	if mgr.probes != 1 {
		t.Fatalf("probes = %d, want 1", mgr.probes)
	}
	if got := clock.pending(); len(got) != 1 || got[0] != 2*time.Second {
		t.Fatalf("after wake: pending = %v, want a fresh 2s retry", got)
	}

	TunnelsNetworkChanged(svc, false)
	if mgr.probes != 2 || len(clock.pending()) != 1 {
		t.Fatal("a network going down should probe but not reschedule")
	}
}

func TestManualStartReplacesAPendingReconnect(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &connReturningDialer{fakeDialer: &fakeDialer{}, conn: &sshx.Conn{}}, mgr)
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "pg", ServerID: srv.ID, Name: "pg", Reconnect: true})
	clock := &manualClock{}
	svc.keeper.after = clock.after
	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateRunning})
	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateError})

	if err := svc.Start("pg"); err != nil {
		t.Fatal(err)
	}
	if len(svc.keeper.waiting()) != 0 || len(clock.pending()) != 0 {
		t.Fatal("a manual Start left the reconnect queued")
	}
}

// tunnelSettingsRig wires Settings › Tunnels into svc with the given switches.
func tunnelSettingsRig(t *testing.T, svc *ForwardService, edit func(*domain.Settings)) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewSettingsRepo(db)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	edit(s)
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	SetForwardSettings(svc, repo)
}

func TestAutoStartOffStartsNothing(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &connReturningDialer{fakeDialer: &fakeDialer{}, conn: &sshx.Conn{}}, mgr)
	tunnelSettingsRig(t, svc, func(s *domain.Settings) { s.TunnelsAutoStart = false })
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "auto", ServerID: srv.ID, Name: "pg", AutoStart: true})
	stop := StartTunnelRuntime(svc, NewLockGate(false), &recordingEmitter{})
	t.Cleanup(stop)
	time.Sleep(30 * time.Millisecond)
	if n := len(mgr.startedIDs()); n != 0 {
		t.Fatalf("started %d tunnels with auto-start off", n)
	}
}

func TestLockStopsTunnelsOnlyWhenKeepWhileLockedIsOff(t *testing.T) {
	for _, keep := range []bool{true, false} {
		mgr := &fakeTunnelManager{running: []forward.Status{{ForwardID: "pg", State: forward.StateRunning}}}
		svc, _, _ := newForwardService(t, &fakeDialer{}, mgr)
		tunnelSettingsRig(t, svc, func(s *domain.Settings) { s.TunnelsKeepWhileLocked = keep })
		gate := NewLockGate(false)
		stop := StartTunnelRuntime(svc, gate, &recordingEmitter{})
		gate.Lock()
		stop()
		stopped := mgr.stoppedID == "pg"
		if stopped == keep {
			t.Fatalf("keep while locked %v: tunnel stopped on lock = %v", keep, stopped)
		}
	}
}

func TestGlobalReconnectOffStopsRetrying(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, &fakeDialer{dialErr: netDown}, mgr)
	srv := mkServer(t, servers, "s1", nil)
	seedForward(t, forwards, domain.PortForward{ID: "pg", ServerID: srv.ID, Name: "pg", Reconnect: true})
	db, err := store.Open(filepath.Join(t.TempDir(), "settings.db"))
	if err != nil {
		t.Fatal(err)
	}
	settings := store.NewSettingsRepo(db)
	SetForwardSettings(svc, settings)
	clock := &manualClock{}
	svc.keeper.after = clock.after

	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateRunning})
	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateError, Detail: "lost"})
	if len(clock.pending()) != 1 {
		t.Fatal("the drop was not queued with reconnect on")
	}
	s, err := settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	s.TunnelsReconnect = false
	if err := settings.Save(s); err != nil {
		t.Fatal(err)
	}
	clock.fire()
	if len(svc.keeper.waiting()) != 0 || len(clock.pending()) != 0 {
		t.Fatal("kept retrying after Reconnect was turned off")
	}

	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateRunning})
	ObserveForward(svc, forward.Status{ForwardID: "pg", State: forward.StateError, Detail: "lost"})
	if len(svc.keeper.waiting()) != 0 {
		t.Fatal("a drop was queued with Reconnect off")
	}
}
