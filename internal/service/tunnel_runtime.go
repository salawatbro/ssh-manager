package service

import (
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/forward"
)

// TrafficInterval is one sparkline bucket: twelve of them make the Tunnels
// page's ten minutes.
const TrafficInterval = 50 * time.Second

// The functions below are package-level, not methods, so they never become
// frontend bindings (see SetForwardDeps).

// ObserveForward feeds a Manager status to the reconnect keeper and the
// tunnel alerts. main.go calls it from the Manager's emit, after the event
// went to the frontend.
func ObserveForward(s *ForwardService, st forward.Status) {
	if s != nil {
		s.keeper.observe(st)
		s.alert(st)
	}
}

// StartTunnelRuntime starts the auto-start tunnels — at once, or at the first
// unlock when the App Lock is engaged, since a reconnect may need a stored
// secret or a signature — and the traffic ticker that emits forward:stats.
// With "Keep tunnels running while Zish is locked" off, every lock stops
// every tunnel. It returns a stop for the ticker.
func StartTunnelRuntime(s *ForwardService, gate *LockGate, emit Emitter) (stop func()) {
	return startTunnelRuntime(s, gate, emit, TrafficInterval)
}

func startTunnelRuntime(s *ForwardService, gate *LockGate, emit Emitter, every time.Duration) func() {
	s.keeper.setLocked(gate.Locked)
	var once sync.Once
	autoStart := func() { once.Do(func() { go s.autoStart() }) }
	// Registered before the Locked check so an unlock in between is not lost.
	gate.OnUnlock(func() {
		autoStart()
		s.keeper.kick()
	})
	if !gate.Locked() {
		autoStart()
	}
	gate.OnLock(func() {
		if !s.tunnelSettings().TunnelsKeepWhileLocked {
			s.StopAll()
		}
	})

	done := make(chan struct{})
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				if tunnels := s.mgr.Tick(); len(tunnels) > 0 {
					emit.Emit("forward:stats", forward.TrafficReport{Tunnels: tunnels})
				}
			}
		}
	}()
	var stopOnce sync.Once
	return func() { stopOnce.Do(func() { close(done) }) }
}

// autoStart brings up every tunnel whose AutoStart switch is on, unless
// Settings › Tunnels turned auto-start off.
func (s *ForwardService) autoStart() {
	set := s.tunnelSettings()
	if !set.TunnelsAutoStart {
		return
	}
	forwards, err := s.repo.ListAll()
	if err != nil {
		return
	}
	var wg sync.WaitGroup
	for _, f := range forwards {
		if !f.AutoStart {
			continue
		}
		wg.Add(1)
		go func(id string, reconnect bool) {
			defer wg.Done()
			s.keeper.launch(id, reconnect)
		}(f.ID, f.Reconnect && set.TunnelsReconnect)
	}
	wg.Wait()
}

// TunnelsWoke checks every running tunnel after the Mac wakes and retries the
// waiting ones now instead of at the end of their back-off.
func TunnelsWoke(s *ForwardService) {
	s.keeper.probeAll()
	s.keeper.kick()
}

// TunnelsNetworkChanged does the same on a network change; while no network
// is up, retrying would only fail, so it just checks.
func TunnelsNetworkChanged(s *ForwardService, up bool) {
	s.keeper.probeAll()
	if up {
		s.keeper.kick()
	}
}
