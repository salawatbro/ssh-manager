package service

import (
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
)

const (
	firstReconnectDelay = 2 * time.Second
	maxReconnectDelay   = 5 * time.Minute
	detailWaitsUnlock   = "Reconnects once Zish is unlocked."
)

// reconnectDelay is the wait before reconnect attempt n (n ≥ 1): 2 s,
// doubling, capped at five minutes.
func reconnectDelay(attempt int) time.Duration {
	d := firstReconnectDelay
	for i := 1; i < attempt && d < maxReconnectDelay; i++ {
		d *= 2
	}
	return min(d, maxReconnectDelay)
}

// retryable reports whether a failed start may succeed later on its own: the
// network, not a refused login, a changed host key, a busy port or a bad row.
// Retrying a refused login would also repeat a Touch ID prompt the user just
// declined.
func retryable(err error) bool {
	var de *domain.Error
	if !errors.As(err, &de) {
		return false
	}
	switch de.Code {
	case domain.CodeConnRefused, domain.CodeConnTimeout, domain.CodeDNS:
		return true
	case domain.CodeJumpFailed:
		msg := strings.ToLower(de.Message)
		return !strings.Contains(msg, "unable to authenticate") && !strings.Contains(msg, "host key")
	}
	return false
}

// retry is one dropped tunnel waiting to come back.
type retry struct {
	attempt  int
	detail   string      // why it is down, shown while it waits
	cancel   func() bool // the pending timer; nil while parked or dialing
	inFlight bool
	dropped  bool // the user stopped it while an attempt was dialing
	again    bool // it came up and dropped again before the attempt returned
}

// tunnelKeeper brings tunnels back: after they drop on their own (when their
// Reconnect switch is on), after a wake or network change, and parks them
// while the App Lock is engaged, since a reconnect may need a stored secret
// or a signature.
type tunnelKeeper struct {
	mu    sync.Mutex
	last  map[string]forward.State
	waits map[string]*retry

	start    func(id string) error
	stop     func(id string) error
	wants    func(id string) bool // the forward's Reconnect switch
	report   func(id string, state forward.State, detail string)
	locked   func() bool
	probeAll func()
	after    func(d time.Duration, fn func()) (cancel func() bool)
}

func newTunnelKeeper() *tunnelKeeper {
	return &tunnelKeeper{
		last:   map[string]forward.State{},
		waits:  map[string]*retry{},
		locked: func() bool { return false },
		after: func(d time.Duration, fn func()) func() bool {
			return time.AfterFunc(d, fn).Stop
		},
	}
}

func (k *tunnelKeeper) setLocked(fn func() bool) {
	k.mu.Lock()
	k.locked = fn
	k.mu.Unlock()
}

// observe follows the Manager's status stream. It runs inside the Manager's
// emit, so it never calls back into the Manager while holding k.mu.
func (k *tunnelKeeper) observe(st forward.Status) {
	id := st.ForwardID
	k.mu.Lock()
	prev := k.last[id]
	k.last[id] = st.State
	if st.State == forward.StateRunning {
		if r := k.waits[id]; r != nil && !r.inFlight {
			k.cancelLocked(id, r)
		}
	}
	k.mu.Unlock()
	if st.State == forward.StateError && prev == forward.StateRunning && k.wants(id) {
		k.schedule(id, st.Detail)
	}
}

// schedule queues the next attempt for id with a growing delay, or parks it
// while the lock is on.
func (k *tunnelKeeper) schedule(id, detail string) {
	k.mu.Lock()
	r := k.waits[id]
	if r == nil {
		r = &retry{}
		k.waits[id] = r
	}
	if r.inFlight {
		r.again, r.detail = true, detail
		k.mu.Unlock()
		return
	}
	r.attempt++
	r.detail = detail
	shown := detail
	if k.locked() {
		shown = detailWaitsUnlock
	} else {
		r.cancel = k.after(reconnectDelay(r.attempt), func() { k.attempt(id, r) })
	}
	k.mu.Unlock()
	k.report(id, forward.StateRetrying, shown)
}

// attempt dials id once on behalf of its retry r.
func (k *tunnelKeeper) attempt(id string, r *retry) {
	k.mu.Lock()
	if k.waits[id] != r || r.inFlight {
		k.mu.Unlock()
		return
	}
	r.cancel = nil
	if k.locked() {
		k.mu.Unlock()
		k.report(id, forward.StateRetrying, detailWaitsUnlock)
		return
	}
	r.inFlight = true
	k.mu.Unlock()

	err := k.start(id)
	// A Reconnect switch may have been turned off while this one waited.
	retry := err != nil && retryable(err) && k.wants(id)

	k.mu.Lock()
	r.inFlight = false
	if r.again && !r.dropped && k.waits[id] == r {
		r.again = false
		detail := r.detail
		k.mu.Unlock()
		k.schedule(id, detail)
		return
	}
	if r.dropped {
		k.mu.Unlock()
		if err == nil {
			_ = k.stop(id)
		}
		return
	}
	current := k.waits[id] == r
	if err == nil || !current || !retry {
		if current {
			delete(k.waits, id)
		}
		k.mu.Unlock()
		if err != nil && current {
			k.failed(id, err)
		}
		return
	}
	k.mu.Unlock()
	k.schedule(id, err.Error())
}

// launch is one auto-start at boot: a network failure falls into the retry
// loop when the tunnel reconnects; anything else shows as failed.
func (k *tunnelKeeper) launch(id string, reconnect bool) {
	k.mu.Lock()
	delete(k.last, id)
	k.mu.Unlock()
	err := k.start(id)
	switch {
	case err == nil:
	case reconnect && retryable(err):
		k.schedule(id, err.Error())
	default:
		k.failed(id, err)
	}
}

// failed shows a start error nobody else reported: a listen failure already
// came through the Manager (with its busy-port flag), a dial error did not.
func (k *tunnelKeeper) failed(id string, err error) {
	k.mu.Lock()
	reported := k.last[id] == forward.StateError
	k.mu.Unlock()
	if !reported {
		k.report(id, forward.StateError, err.Error())
	}
}

// kick retries every waiting tunnel from a fresh back-off: after a wake, a
// network that came back, or an unlock.
func (k *tunnelKeeper) kick() {
	k.mu.Lock()
	type wait struct{ id, detail string }
	var due []wait
	for id, r := range k.waits {
		if r.inFlight {
			continue
		}
		if r.cancel != nil {
			r.cancel()
			r.cancel = nil
		}
		r.attempt = 0
		due = append(due, wait{id, r.detail})
	}
	k.mu.Unlock()
	for _, w := range due {
		k.schedule(w.id, w.detail)
	}
}

// forget drops id's retry, if any, and reports whether there was one.
func (k *tunnelKeeper) forget(id string) bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	r := k.waits[id]
	if r == nil {
		return false
	}
	r.dropped = true
	k.cancelLocked(id, r)
	return true
}

func (k *tunnelKeeper) cancelLocked(id string, r *retry) {
	if r.cancel != nil {
		r.cancel()
		r.cancel = nil
	}
	delete(k.waits, id)
}

// waiting lists the ids with a pending retry.
func (k *tunnelKeeper) waiting() []string {
	k.mu.Lock()
	defer k.mu.Unlock()
	ids := make([]string, 0, len(k.waits))
	for id := range k.waits {
		ids = append(ids, id)
	}
	return ids
}
