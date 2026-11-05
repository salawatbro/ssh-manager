package service

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
)

// manualClock hands out timers that only fire when the test says so.
type manualClock struct {
	mu     sync.Mutex
	timers []*manualTimer
}

type manualTimer struct {
	d       time.Duration
	fn      func()
	stopped bool
}

func (c *manualClock) after(d time.Duration, fn func()) func() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	t := &manualTimer{d: d, fn: fn}
	c.timers = append(c.timers, t)
	return func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		was := !t.stopped
		t.stopped = true
		return was
	}
}

// pending returns the delays of the timers still armed.
func (c *manualClock) pending() []time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	var out []time.Duration
	for _, t := range c.timers {
		if !t.stopped {
			out = append(out, t.d)
		}
	}
	return out
}

// fire runs every armed timer once, as if their delays had passed.
func (c *manualClock) fire() {
	c.mu.Lock()
	var due []*manualTimer
	for _, t := range c.timers {
		if !t.stopped {
			t.stopped = true
			due = append(due, t)
		}
	}
	c.mu.Unlock()
	for _, t := range due {
		t.fn()
	}
}

// keeperRig is a tunnelKeeper with every dependency recorded.
type keeperRig struct {
	k      *tunnelKeeper
	clock  *manualClock
	mu     sync.Mutex
	starts int
	stops  []string
	errs   []error // returned by successive starts; nil once used up
	wants  bool
	locked bool
	shown  []forward.Status
}

func newKeeperRig() *keeperRig {
	r := &keeperRig{clock: &manualClock{}, wants: true}
	k := newTunnelKeeper()
	k.after = r.clock.after
	k.start = func(string) error {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.starts++
		if len(r.errs) == 0 {
			return nil
		}
		err := r.errs[0]
		r.errs = r.errs[1:]
		return err
	}
	k.stop = func(id string) error {
		r.mu.Lock()
		r.stops = append(r.stops, id)
		r.mu.Unlock()
		return nil
	}
	k.wants = func(string) bool { return r.wants }
	k.report = func(id string, state forward.State, detail string) {
		r.mu.Lock()
		r.shown = append(r.shown, forward.Status{ForwardID: id, State: state, Detail: detail})
		r.mu.Unlock()
		k.observe(forward.Status{ForwardID: id, State: state, Detail: detail})
	}
	k.locked = func() bool {
		r.mu.Lock()
		defer r.mu.Unlock()
		return r.locked
	}
	k.probeAll = func() {}
	r.k = k
	return r
}

func (r *keeperRig) last() forward.Status {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.shown) == 0 {
		return forward.Status{}
	}
	return r.shown[len(r.shown)-1]
}

// drop plays a running tunnel dying on its own.
func (r *keeperRig) drop(id string) {
	r.k.observe(forward.Status{ForwardID: id, State: forward.StateRunning})
	r.k.observe(forward.Status{ForwardID: id, State: forward.StateError, Detail: "The connection to the server was lost."})
}

var netDown = domain.NewError(domain.CodeConnTimeout, "Connection timed out.")

func TestReconnectDelayDoublesUpToFiveMinutes(t *testing.T) {
	cases := map[int]time.Duration{
		1: 2 * time.Second, 2: 4 * time.Second, 3: 8 * time.Second,
		8: 256 * time.Second, 9: 5 * time.Minute, 40: 5 * time.Minute,
	}
	for attempt, want := range cases {
		if got := reconnectDelay(attempt); got != want {
			t.Errorf("reconnectDelay(%d) = %v, want %v", attempt, got, want)
		}
	}
}

func TestRetryableOnlyForNetworkFailures(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{domain.NewError(domain.CodeConnRefused, "refused"), true},
		{domain.NewError(domain.CodeConnTimeout, "timeout"), true},
		{domain.NewError(domain.CodeDNS, "dns"), true},
		{domain.NewError(domain.CodeJumpFailed, `Could not connect to jump host "b": dial tcp: i/o timeout`), true},
		{domain.NewError(domain.CodeJumpFailed, `Could not connect to jump host "b": ssh: handshake failed: ssh: unable to authenticate`), false},
		{domain.NewError(domain.CodeAuthFailed, "Authentication failed."), false},
		{domain.NewError(domain.CodeHostKeyChanged, "changed"), false},
		{domain.ErrNotFound, false},
		{errors.New("listen tcp 127.0.0.1:5432: bind: address already in use"), false},
	}
	for _, c := range cases {
		if got := retryable(c.err); got != c.want {
			t.Errorf("retryable(%v) = %v, want %v", c.err, got, c.want)
		}
	}
}

func TestKeeperReconnectsADroppedTunnel(t *testing.T) {
	r := newKeeperRig()
	r.drop("pg")

	if got := r.clock.pending(); len(got) != 1 || got[0] != 2*time.Second {
		t.Fatalf("pending timers = %v, want one 2s retry", got)
	}
	if st := r.last(); st.State != forward.StateRetrying || st.Detail == "" {
		t.Fatalf("shown = %+v, want retrying with the reason", st)
	}

	r.clock.fire()
	if r.starts != 1 {
		t.Fatalf("starts = %d, want 1", r.starts)
	}
	if len(r.k.waiting()) != 0 {
		t.Fatal("a successful reconnect left a retry queued")
	}
}

func TestKeeperLeavesTunnelDownWhenReconnectIsOff(t *testing.T) {
	r := newKeeperRig()
	r.wants = false
	r.drop("pg")
	if len(r.clock.pending()) != 0 || len(r.k.waiting()) != 0 {
		t.Fatal("a tunnel with Reconnect off was queued")
	}
}

func TestKeeperIgnoresAFailedStart(t *testing.T) {
	r := newKeeperRig()
	// A listener that never came up (busy port) goes straight to error.
	r.k.observe(forward.Status{ForwardID: "pg", State: forward.StateError, PortBusy: true})
	if len(r.k.waiting()) != 0 {
		t.Fatal("a start failure was treated as a drop")
	}
}

func TestKeeperBacksOffThenGivesUpOnALogin(t *testing.T) {
	r := newKeeperRig()
	r.errs = []error{netDown, netDown, domain.NewError(domain.CodeAuthFailed, "Authentication failed.")}
	r.drop("pg")

	r.clock.fire() // attempt 1 fails: network
	if got := r.clock.pending(); len(got) != 1 || got[0] != 4*time.Second {
		t.Fatalf("after one failure: pending = %v, want 4s", got)
	}
	r.clock.fire() // attempt 2 fails: network
	if got := r.clock.pending(); len(got) != 1 || got[0] != 8*time.Second {
		t.Fatalf("after two failures: pending = %v, want 8s", got)
	}
	r.clock.fire() // attempt 3: refused login, stop
	if len(r.clock.pending()) != 0 || len(r.k.waiting()) != 0 {
		t.Fatal("a refused login kept retrying")
	}
	if st := r.last(); st.State != forward.StateError || st.Detail != "Authentication failed." {
		t.Fatalf("shown = %+v, want the login error", st)
	}
}

func TestKeeperParksWhileLockedAndResumesOnKick(t *testing.T) {
	r := newKeeperRig()
	r.locked = true
	r.drop("pg")
	if len(r.clock.pending()) != 0 {
		t.Fatal("a reconnect was scheduled while locked")
	}
	if st := r.last(); st.State != forward.StateRetrying || st.Detail != detailWaitsUnlock {
		t.Fatalf("shown = %+v, want waiting for unlock", st)
	}

	r.locked = false
	r.k.kick()
	if got := r.clock.pending(); len(got) != 1 || got[0] != 2*time.Second {
		t.Fatalf("after unlock: pending = %v, want a fresh 2s retry", got)
	}
	r.clock.fire()
	if r.starts != 1 {
		t.Fatalf("starts = %d, want 1", r.starts)
	}
}

func TestKeeperTimerThatFiresWhileLockedParks(t *testing.T) {
	r := newKeeperRig()
	r.drop("pg")
	r.locked = true
	r.clock.fire()
	if r.starts != 0 {
		t.Fatal("dialed while locked")
	}
	if st := r.last(); st.Detail != detailWaitsUnlock {
		t.Fatalf("shown = %+v, want waiting for unlock", st)
	}
}

func TestKeeperKickRestartsTheBackOff(t *testing.T) {
	r := newKeeperRig()
	r.errs = []error{netDown, netDown, netDown}
	r.drop("pg")
	r.clock.fire()
	r.clock.fire()
	if got := r.clock.pending(); got[0] != 8*time.Second {
		t.Fatalf("pending = %v, want 8s before the kick", got)
	}
	r.k.kick()
	if got := r.clock.pending(); len(got) != 1 || got[0] != 2*time.Second {
		t.Fatalf("after kick: pending = %v, want one 2s retry", got)
	}
}

func TestKeeperForgetCancelsTheRetry(t *testing.T) {
	r := newKeeperRig()
	r.drop("pg")
	if !r.k.forget("pg") {
		t.Fatal("forget found nothing to cancel")
	}
	r.clock.fire()
	if r.starts != 0 {
		t.Fatal("a forgotten retry still dialed")
	}
	if r.k.forget("pg") {
		t.Fatal("forget reported a retry twice")
	}
}

func TestKeeperStopsATunnelForgottenMidDial(t *testing.T) {
	r := newKeeperRig()
	r.drop("pg")
	r.k.start = func(id string) error {
		r.k.forget(id) // the user flips the switch off while it dials
		return nil
	}
	r.clock.fire()
	if len(r.stops) != 1 || r.stops[0] != "pg" {
		t.Fatalf("stops = %v, want the late tunnel stopped", r.stops)
	}
}

func TestKeeperLaunchRetriesOnlyNetworkFailures(t *testing.T) {
	r := newKeeperRig()
	r.errs = []error{netDown}
	r.k.launch("pg", true)
	if got := r.clock.pending(); len(got) != 1 {
		t.Fatalf("offline auto-start: pending = %v, want a retry", got)
	}

	r2 := newKeeperRig()
	r2.errs = []error{netDown}
	r2.k.launch("pg", false)
	if len(r2.clock.pending()) != 0 {
		t.Fatal("auto-start retried with Reconnect off")
	}
	if st := r2.last(); st.State != forward.StateError {
		t.Fatalf("shown = %+v, want the failure", st)
	}
}

func TestKeeperDoesNotOverwriteAManagerError(t *testing.T) {
	r := newKeeperRig()
	busy := errors.New("listen tcp 127.0.0.1:6379: bind: address already in use")
	r.k.start = func(id string) error {
		// The Manager reports its own busy-port error before returning.
		r.k.observe(forward.Status{ForwardID: id, State: forward.StateError, PortBusy: true})
		return busy
	}
	r.k.launch("redis", true)
	if len(r.shown) != 0 {
		t.Fatalf("keeper reported %+v over the Manager's busy-port error", r.shown)
	}
}
