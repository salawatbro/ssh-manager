// Package forward runs background port-forward tunnels ("-L" and "-R") over
// an existing SSH connection. The Manager owns each tunnel's listener and the
// sshx.Conn it forwards through; Stop guarantees every goroutine the tunnel
// spawned has exited before it returns (leak-free teardown), which is the
// package's top design priority — a forward can run for the lifetime of the
// app, and a leaked accept or copy goroutine per Stop/Start cycle would be a
// slow, silent resource leak.
package forward

import (
	"fmt"
	"io"
	"net"
	"strconv"
	"sync"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// State is a forward's lifecycle state.
type State string

// The three states a forward can report: running while its listener is
// accepting, stopped after a deliberate Stop, error when the listener failed
// to bind or the accept loop died unexpectedly.
const (
	StateRunning State = "running"
	StateStopped State = "stopped"
	StateError   State = "error"
)

// Status is a snapshot of one forward's state, suitable for emitting to the
// frontend or returning from Status/Running.
type Status struct {
	ForwardID string `json:"forwardId"`
	State     State  `json:"state"`
	Detail    string `json:"detail"`
}

// runner holds one live tunnel's goroutine coordination. wg tracks every
// goroutine the tunnel spawns — the accept loop and every per-connection copy
// — so Stop's wg.Wait() only returns once all of them have actually exited.
type runner struct {
	listener net.Listener
	conn     *sshx.Conn
	wg       sync.WaitGroup
	quit     chan struct{} // closed by Stop to mark the shutdown as deliberate
}

// Manager owns all live forwards. It takes ownership of each conn passed to
// Start and closes it on Stop.
type Manager struct {
	mu     sync.Mutex
	runs   map[string]*runner
	status map[string]Status // last-reported status per forward ID, kept after Stop removes it from runs
	emit   func(Status)
}

// NewManager builds a manager. emit is called on every state transition
// (running/stopped/error); it may be nil.
func NewManager(emit func(Status)) *Manager {
	return &Manager{runs: map[string]*runner{}, status: map[string]Status{}, emit: emit}
}

// Start opens the tunnel described by fwd over conn. The Manager takes
// ownership of conn and closes it when the tunnel stops, whether that is a
// listen failure here, a later accept error, or a call to Stop/StopAll. The
// one exception is the "already running" error below: Start never touched
// conn, so ownership never transferred and the caller keeps it.
func (m *Manager) Start(fwd domain.PortForward, conn *sshx.Conn) error {
	m.mu.Lock()
	if _, ok := m.runs[fwd.ID]; ok {
		m.mu.Unlock()
		return fmt.Errorf("forward %s already running", fwd.ID)
	}

	bind := net.JoinHostPort(fwd.BindAddr, itoa(fwd.BindPort))
	dest := net.JoinHostPort(fwd.DestHost, itoa(fwd.DestPort))

	var ln net.Listener
	var err error
	switch fwd.Type {
	case domain.ForwardLocal:
		ln, err = net.Listen("tcp", bind) // local listener
	case domain.ForwardRemote:
		ln, err = conn.Client.Listen("tcp", bind) // remote listener over ssh
	default:
		err = fmt.Errorf("unknown forward type %q", fwd.Type)
	}
	if err != nil {
		// Held m.mu since the map check above so a concurrent Start for the
		// same fwd.ID can't race the listen call, but it MUST be released
		// before report: report locks m.mu itself, and Go's sync.Mutex is
		// not reentrant — calling report while still holding the lock here
		// would self-deadlock.
		m.mu.Unlock()
		_ = conn.Close()
		m.report(fwd.ID, StateError, err.Error())
		return err
	}

	r := &runner{listener: ln, conn: conn, quit: make(chan struct{})}
	m.runs[fwd.ID] = r
	r.wg.Add(1)
	m.mu.Unlock()

	go m.accept(fwd, r, dest)
	m.report(fwd.ID, StateRunning, "")
	return nil
}

// accept loops on the listener; for each inbound conn it opens the paired
// dial (remote for -L, local for -R) and pipes bytes both ways.
func (m *Manager) accept(fwd domain.PortForward, r *runner, dest string) {
	defer r.wg.Done()
	for {
		in, err := r.listener.Accept()
		if err != nil {
			select {
			case <-r.quit: // deliberate Stop — not a real error, don't report one
			default:
				m.report(fwd.ID, StateError, err.Error())
			}
			return
		}
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			defer func() { _ = in.Close() }()
			var out net.Conn
			var derr error
			if fwd.Type == domain.ForwardLocal {
				out, derr = r.conn.Client.Dial("tcp", dest) // -L: remote side
			} else {
				out, derr = net.Dial("tcp", dest) // -R: local side
			}
			if derr != nil {
				return
			}
			defer func() { _ = out.Close() }()
			pipe(in, out)
		}()
	}
}

// pipe copies a<->b until either direction ends (EOF or error), then closes
// both connections to unblock whichever direction is still blocked in Read,
// and does not return until BOTH copy goroutines have exited.
//
// Returning only when one side finishes (without also closing both ends
// here) would leave the other copy goroutine running untracked after pipe
// returns: the caller's wg.Done() fires as soon as pipe returns, so an
// in-flight copy that outlives pipe would be invisible to wg.Wait() — a real
// (if usually brief) leak that "Stop leaks nothing" tests could catch as
// flakiness. Closing both ends here, inside pipe, breaks that: the still-
// blocked Read unblocks immediately instead of waiting for the caller's own
// deferred Close (which only runs after pipe returns — that ordering would
// deadlock if pipe instead waited on both goroutines without closing early).
func pipe(a, b net.Conn) {
	var closeOnce sync.Once
	closeBoth := func() {
		closeOnce.Do(func() {
			_ = a.Close()
			_ = b.Close()
		})
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(a, b)
		closeBoth()
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(b, a)
		closeBoth()
	}()
	wg.Wait()
}

// Stop tears the forward down: closes the listener and conn (dropping any
// in-flight tunneled connections), waits for every goroutine the runner
// spawned to exit, then reports stopped. Stopping an unknown id is a no-op.
func (m *Manager) Stop(id string) error {
	m.mu.Lock()
	r, ok := m.runs[id]
	if ok {
		delete(m.runs, id)
	}
	m.mu.Unlock()
	if !ok {
		return nil
	}
	close(r.quit)
	_ = r.listener.Close()
	_ = r.conn.Close() // drops in-flight tunneled conns, unblocking any pipe() still running
	r.wg.Wait()        // no goroutine leak: every accept/copy goroutine has now exited
	m.report(id, StateStopped, "")
	return nil
}

// StopAll stops every running forward.
func (m *Manager) StopAll() {
	m.mu.Lock()
	ids := make([]string, 0, len(m.runs))
	for id := range m.runs {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		_ = m.Stop(id)
	}
}

// Status reports the last-known state of a forward, including after it has
// stopped. An id that was never started returns the zero State.
func (m *Manager) Status(id string) Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	if st, ok := m.status[id]; ok {
		return st
	}
	return Status{ForwardID: id}
}

// Running lists the status of every currently-running forward.
func (m *Manager) Running() []Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Status, 0, len(m.runs))
	for id := range m.runs {
		if st, ok := m.status[id]; ok {
			out = append(out, st)
			continue
		}
		out = append(out, Status{ForwardID: id, State: StateRunning})
	}
	return out
}

// report records the status for id and emits it. It must NOT hold m.mu while
// calling emit: emit runs caller-supplied code (in this app, a Wails event
// emit) that could in principle call back into the Manager (e.g. Status or
// another Start/Stop), and holding the lock across that call would risk a
// re-entrant deadlock. So the status map update happens under the lock, and
// emit is called only after it's released.
func (m *Manager) report(id string, state State, detail string) {
	st := Status{ForwardID: id, State: state, Detail: detail}
	m.mu.Lock()
	m.status[id] = st
	m.mu.Unlock()
	if m.emit != nil {
		m.emit(st)
	}
}

// itoa converts a port number to its string form for net.JoinHostPort.
func itoa(n int) string { return strconv.Itoa(n) }
