package service

import "sync"

// LockGate is the backend's copy of the App Lock state. The askpass broker
// (and later the agent) consult it: while locked, nothing answers with a
// stored secret.
type LockGate struct {
	mu     sync.Mutex
	locked bool
	onLock []func()
}

// NewLockGate returns a gate in the given state.
func NewLockGate(locked bool) *LockGate { return &LockGate{locked: locked} }

// Locked reports the current state.
func (g *LockGate) Locked() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.locked
}

// Lock locks the gate and runs every OnLock listener. Idempotent: listeners
// run on each call, so they must be too.
func (g *LockGate) Lock() {
	g.mu.Lock()
	g.locked = true
	fns := append([]func(){}, g.onLock...)
	g.mu.Unlock()
	for _, fn := range fns {
		fn()
	}
}

// Unlock opens the gate.
func (g *LockGate) Unlock() {
	g.mu.Lock()
	g.locked = false
	g.mu.Unlock()
}

// OnLock registers fn to run whenever the gate locks.
func (g *LockGate) OnLock(fn func()) {
	g.mu.Lock()
	g.onLock = append(g.onLock, fn)
	g.mu.Unlock()
}
