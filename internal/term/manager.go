// Package term runs interactive terminal sessions over sshx PTYs. It owns the
// I/O pump (coalescing terminal output into rate-bounded, sequenced events),
// keep-alive, and session lifecycle. It emits through an injected Emitter and
// imports nothing from Wails, so internal/... stays cgo-free (R-05).
package term

import (
	"encoding/base64"
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// Event names (static — RegisterEvent happens once in main.go; sessionID rides
// in the payload, never in the name).
const (
	EventData      = "term:data"
	EventState     = "session:state"
	StateConnected = "connected"
	StateClosed    = "closed"
)

// Emitter is the slice of the Wails app the manager needs; a fake satisfies it
// in tests. Declared here (consumer side) so term imports nothing from service.
type Emitter interface {
	Emit(name string, data ...any) bool
}

// PTY is the terminal transport the manager drives. *sshx.Session satisfies it.
type PTY interface {
	Read(p []byte) (int, error)
	Write(p []byte) (int, error)
	Resize(cols, rows int) error
	KeepAlive() error
	Close() error
}

// Output is the term:data payload. Data is base64 so arbitrary (non-UTF-8)
// terminal bytes survive JSON marshalling intact.
type Output struct {
	SessionID string `json:"sessionID"`
	Seq       uint64 `json:"seq"`
	Data      string `json:"data"`
}

// State is the session:state payload. State is connected|closed; Code/Message
// are set only on an abnormal close (drop / dead peer).
type State struct {
	SessionID string `json:"sessionID"`
	State     string `json:"state"`
	Code      string `json:"code"`
	Message   string `json:"message"`
}

// Manager owns all live sessions.
type Manager struct {
	emitter     Emitter
	flush       time.Duration
	keepAlive   time.Duration
	keepEnabled func() bool
	mu          sync.Mutex
	runners     map[string]*runner
}

// NewManager builds a manager. flush is the coalescing interval (~16ms);
// keepAlive is the keep-alive / dead-peer probe interval (~30s).
func NewManager(e Emitter, flush, keepAlive time.Duration) *Manager {
	return &Manager{emitter: e, flush: flush, keepAlive: keepAlive, runners: map[string]*runner{}}
}

// SetKeepAliveEnabled installs a live predicate for the "Keep the terminal
// awake" setting, read on each probe tick so a toggle takes effect without
// reconnecting (mirrors Dialer.SetDialTimeoutProvider). A nil predicate — the
// default — means always enabled, preserving the original always-probe
// behaviour.
func (m *Manager) SetKeepAliveEnabled(fn func() bool) { m.keepEnabled = fn }

// runner holds one session's goroutine coordination.
type runner struct {
	pty  PTY
	stop chan struct{} // closed to stop the pump (user close / dead peer)
	once sync.Once
}

// Add registers a session and starts its pump, keep-alive and reader. It emits
// session:state connected immediately, then term:data as output flows.
func (m *Manager) Add(sessionID string, pty PTY) {
	r := &runner{pty: pty, stop: make(chan struct{})}
	m.mu.Lock()
	m.runners[sessionID] = r
	m.mu.Unlock()

	m.emitter.Emit(EventState, State{SessionID: sessionID, State: StateConnected})

	dataCh := make(chan []byte, 64)
	go m.readLoop(r, dataCh)
	go m.pumpLoop(sessionID, r, dataCh)
	go m.keepAliveLoop(sessionID, r)
}

// readLoop copies terminal output into dataCh, closing it on EOF/error so the
// pump knows the session ended. It never emits — ordering lives in the pump.
//
// The send to dataCh also selects on r.stop: pty.Close() only unblocks a
// blocked Read, not a blocked channel send. Without this, a reader stuck
// sending into a full dataCh (pump already gone via r.stop) would leak its
// goroutine and buffer forever. On the r.stop path we deliberately do NOT
// close(dataCh) — the pump has already exited on the same r.stop, so nothing
// reads dataCh again, and closing here would race the EOF path's close.
func (m *Manager) readLoop(r *runner, dataCh chan<- []byte) {
	buf := make([]byte, 32*1024)
	for {
		n, err := r.pty.Read(buf)
		if n > 0 {
			cp := make([]byte, n)
			copy(cp, buf[:n])
			select {
			case dataCh <- cp:
			case <-r.stop:
				return
			}
		}
		if err != nil {
			close(dataCh)
			return
		}
	}
}

// pumpLoop is the SOLE emitter of a session's term:data. It accumulates reader
// output and flushes it on a ticker as one sequenced event, so output is both
// rate-bounded (~1/flush) and strictly ordered. On dataCh close (reader EOF) it
// flushes the tail and shuts the session down as an abnormal (recoverable)
// close. On r.stop (user close / dead peer) it simply stops emitting.
func (m *Manager) pumpLoop(sessionID string, r *runner, dataCh <-chan []byte) {
	tick := time.NewTicker(m.flush)
	defer tick.Stop()
	var (
		acc []byte
		seq uint64
	)
	emit := func() {
		if len(acc) == 0 {
			return
		}
		seq++
		m.emitter.Emit(EventData, Output{
			SessionID: sessionID,
			Seq:       seq,
			Data:      base64.StdEncoding.EncodeToString(acc),
		})
		acc = acc[:0]
	}
	for {
		select {
		case chunk, ok := <-dataCh:
			if !ok {
				emit() // flush the tail before the close notice
				code, msg := domain.CodeSessionClosed, "Connection lost."
				if w, ok := r.pty.(interface{ WaitExitClean() bool }); ok && w.WaitExitClean() {
					// A clean shell exit (exit 0/N, or Ctrl-D) — no notice; the
					// frontend closes the pane the way a real terminal would.
					code, msg = "", ""
				}
				m.shutdown(sessionID, r, true, code, msg)
				return
			}
			acc = append(acc, chunk...)
		case <-tick.C:
			emit()
		case <-r.stop:
			return
		}
	}
}

// keepAliveLoop probes the peer; the first failure tears the session down as an
// abnormal close.
func (m *Manager) keepAliveLoop(sessionID string, r *runner) {
	tick := time.NewTicker(m.keepAlive)
	defer tick.Stop()
	for {
		select {
		case <-tick.C:
			// "Keep the terminal awake" off → skip the probe but keep ticking,
			// so turning it back on resumes probing on the next tick. While off,
			// a dead peer is only noticed on the next read/write.
			if m.keepEnabled != nil && !m.keepEnabled() {
				continue
			}
			if err := r.pty.KeepAlive(); err != nil {
				m.shutdown(sessionID, r, true, domain.CodeSessionClosed, "Connection lost.")
				return
			}
		case <-r.stop:
			return
		}
	}
}

// Write base64-decodes data and sends it to the session's stdin.
func (m *Manager) Write(sessionID, dataB64 string) error {
	r, err := m.get(sessionID)
	if err != nil {
		return err
	}
	raw, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return domain.NewError(domain.CodeValidation, "Malformed terminal input.")
	}
	_, err = r.pty.Write(raw)
	return err
}

// Resize forwards a new size to the pty.
func (m *Manager) Resize(sessionID string, cols, rows int) error {
	r, err := m.get(sessionID)
	if err != nil {
		return err
	}
	return r.pty.Resize(cols, rows)
}

// Close tears a session down at the user's request — silently (no
// session:state, because the frontend initiated it and has already removed the
// pane).
func (m *Manager) Close(sessionID string) error {
	r, err := m.get(sessionID)
	if err != nil {
		return err
	}
	m.shutdown(sessionID, r, false, "", "")
	return nil
}

// CloseAll shuts every session down on app quit (silent).
func (m *Manager) CloseAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.runners))
	for id := range m.runners {
		ids = append(ids, id)
	}
	rs := make([]*runner, 0, len(ids))
	for _, id := range ids {
		rs = append(rs, m.runners[id])
	}
	m.mu.Unlock()
	for i, id := range ids {
		m.shutdown(id, rs[i], false, "", "")
	}
}

// shutdown stops the pump, closes the pty, removes the runner, and (only when
// emit is true) publishes session:state closed. Idempotent: reader-EOF,
// dead-peer and user-close can all race to here; sync.Once lets the first win.
func (m *Manager) shutdown(sessionID string, r *runner, emit bool, code, msg string) {
	r.once.Do(func() {
		close(r.stop)
		_ = r.pty.Close()
		m.mu.Lock()
		delete(m.runners, sessionID)
		m.mu.Unlock()
		if emit {
			m.emitter.Emit(EventState, State{
				SessionID: sessionID,
				State:     StateClosed,
				Code:      code,
				Message:   msg,
			})
		}
	})
}

func (m *Manager) get(sessionID string) (*runner, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.runners[sessionID]
	if !ok {
		return nil, domain.NewError(domain.CodeNotFound, "No such terminal session.")
	}
	return r, nil
}

// SessionCount reports how many sessions are live — used by the quit-confirm
// prompt (main.go's ShouldQuit).
func (m *Manager) SessionCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.runners)
}
