// Package forward runs background port-forward tunnels ("-L" and "-R") over
// an existing SSH connection. The Manager owns each tunnel's listener and the
// sshx.Conn it forwards through; Stop guarantees every goroutine the tunnel
// spawned has exited before it returns (leak-free teardown), which is the
// package's top design priority — a forward can run for the lifetime of the
// app, and a leaked accept or copy goroutine per Stop/Start cycle would be a
// slow, silent resource leak.
package forward

import (
	"context"
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
//
// A runner is published into Manager.runs the moment Start reserves the
// forward ID, BEFORE the (possibly slow) network listen completes — see
// Start's doc comment. Until the listen finishes, listener is nil: that's
// the signal (checked only under m.mu) that this runner is still a
// reservation, not a live tunnel. conn and quit/ctx/cancel are set at
// construction, before the runner is ever published, so every goroutine that
// later reads them via a m.mu-guarded map lookup sees a fully-initialized
// value (Go's mutex Lock/Unlock gives that publication a happens-before
// edge) — only listener is filled in later, under m.mu, once the listen
// succeeds.
type runner struct {
	listener net.Listener
	conn     *sshx.Conn
	wg       sync.WaitGroup
	quit     chan struct{}   // closed by Stop to mark the shutdown as deliberate
	ctx      context.Context // cancelled by Stop; bounds per-connection dials so they can't outlive the runner
	cancel   context.CancelFunc
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
//
// The network listen (net.Listen for -L, conn.Client.Listen for -R) happens
// OUTSIDE m.mu. For -R that's an SSH "tcpip-forward" round-trip with no
// timeout, and m.mu guards Stop/StopAll/Status/Running/every other Start —
// holding it across an unbounded remote round-trip would let one hung -R
// Start freeze the whole Manager. Instead:
//
//  1. Under m.mu: fail fast if fwd.ID is already occupied — either a live
//     runner or another Start's in-flight reservation — otherwise publish a
//     placeholder *runner (listener still nil) into m.runs so a concurrent
//     Start(same ID) sees it and fails fast too.
//  2. Outside m.mu: do the listen.
//  3. Under m.mu again: confirm the placeholder we published is STILL the
//     one in m.runs (pointer identity, not just "some entry exists" — a
//     racing Stop can free the ID and let a brand-new Start reserve it
//     before we get back here, and mistaking that newer reservation for our
//     own would finalize the wrong runner or double-finalize). If it's ours,
//     finalize on success or clean up on failure. If it's NOT ours, a
//     concurrent Stop won the race (see Stop's doc comment for its half of
//     this handshake): roll back whatever we just created and do not touch
//     m.runs or m.status — Stop already reported StateStopped for this ID,
//     and clobbering that with a late StateError/StateRunning here would
//     show a stale status (or, worse, race a brand-new Start's own report).
func (m *Manager) Start(fwd domain.PortForward, conn *sshx.Conn) error {
	ctx, cancel := context.WithCancel(context.Background())
	r := &runner{conn: conn, quit: make(chan struct{}), ctx: ctx, cancel: cancel}

	m.mu.Lock()
	if _, ok := m.runs[fwd.ID]; ok {
		m.mu.Unlock()
		cancel()
		// The caller hands us ownership of conn. On this refusal we never
		// store it, so close it here instead of leaking a freshly dialed,
		// authenticated connection (matters in the concurrent double-Start
		// TOCTOU the caller's guard can't cover).
		_ = conn.Close()
		return fmt.Errorf("forward %s already running", fwd.ID)
	}
	m.runs[fwd.ID] = r // reservation: r.listener is nil until finalized below
	m.mu.Unlock()

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

	m.mu.Lock()
	cur, stillOurs := m.runs[fwd.ID]
	stillOurs = stillOurs && cur == r
	if !stillOurs {
		// A concurrent Stop removed our reservation before we finished
		// listening (or failing to). It already tore down and reported;
		// we just clean up what we made and stay quiet.
		m.mu.Unlock()
		if err == nil {
			_ = ln.Close()
		}
		_ = conn.Close()
		return fmt.Errorf("forward %s: stopped before start completed", fwd.ID)
	}
	if err != nil {
		delete(m.runs, fwd.ID)
		m.mu.Unlock()
		cancel()
		_ = conn.Close()
		m.report(fwd.ID, StateError, err.Error())
		return err
	}
	r.listener = ln
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
				m.selfTeardown(fwd.ID, r, err.Error())
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
				// -L: remote side. Client.Dial itself blocks uncancellably,
				// but conn.Close() (Stop) already unblocks it, so ctx here
				// is a low-cost belt-and-suspenders, not a strict need.
				out, derr = r.conn.Client.DialContext(r.ctx, "tcp", dest)
			} else {
				// -R: local side. Plain net.Dial has no way to be
				// interrupted short of its OS-level connect timeout
				// (~1-2 min against an unreachable dest), which would stall
				// Stop's r.wg.Wait() behind it. DialContext bounds it to
				// r.ctx, cancelled the moment Stop runs.
				out, derr = (&net.Dialer{}).DialContext(r.ctx, "tcp", dest)
			}
			if derr != nil {
				return
			}
			defer func() { _ = out.Close() }()
			pipe(in, out)
		}()
	}
}

// selfTeardown handles an accept loop that died from an unexpected (non-Stop)
// Accept error: without it, the runner's conn/map entry would stay live
// until someone happened to call Stop, silently leaking the SSH connection.
//
// It uses the exact same "whoever deletes the map entry owns teardown"
// handshake as Stop (see Stop's doc comment): at most one of {selfTeardown,
// a concurrently-running Stop} can win the delete for a given id, and only
// the winner tears down and reports. This must NOT call r.wg.Wait() —
// accept() itself is one of the goroutines r.wg is tracking, and it hasn't
// returned yet (this call is still on its stack), so waiting here would
// deadlock waiting on its own completion. Closing r.conn is enough to drop
// any in-flight per-connection copies; they unblock and finish (and call
// their own r.wg.Done()) independently, with nothing left needing to wait on
// them synchronously.
func (m *Manager) selfTeardown(id string, r *runner, detail string) {
	m.mu.Lock()
	cur, ok := m.runs[id]
	won := ok && cur == r
	if won {
		delete(m.runs, id)
	}
	m.mu.Unlock()
	if !won {
		// A concurrent Stop already claimed this id; it owns teardown and
		// will report StateStopped. Reporting StateError here too would be
		// racy with that report (and could clobber a fresher status from a
		// brand-new Start that reused the id after Stop freed it).
		return
	}
	r.cancel()
	_ = r.listener.Close() // mirrors Stop's teardown; Accept() already failed on it, but this releases the fd for certain
	_ = r.conn.Close()
	m.report(id, StateError, detail)
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
//
// The map lookup-and-delete is the exactly-once handshake this package uses
// wherever two goroutines could both try to own the same runner's teardown
// (see also selfTeardown, and Start's "stillOurs" check): whichever caller
// actually finds and deletes m.runs[id] under m.mu is the one that tears it
// down and reports; a caller that finds the entry already gone treats it as
// a no-op rather than risk a double-close or a double report.
//
// This also runs correctly against a runner Start hasn't finished starting
// yet (r.listener still nil, r.wg count still 0 — see Start's doc comment):
// closing r.conn here still unblocks a -R Start that's mid-listen (an SSH
// global request fails once the underlying connection closes), so the
// in-flight Start observes the lost reservation and rolls back on its own
// when it eventually returns. r.wg.Wait() returns immediately since nothing
// has Add()ed to it yet, so Stop stays prompt either way.
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
	r.cancel() // unblocks any in-flight -R per-conn dial waiting in DialContext
	if r.listener != nil {
		_ = r.listener.Close()
	}
	_ = r.conn.Close() // drops in-flight tunneled conns (and, if Start is still mid-listen, the listen itself)
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

// Running lists the status of every currently-running forward. A forward
// whose Start is still mid-listen (see Start's doc comment: reserved in
// m.runs but r.listener not yet set) is deliberately excluded — it isn't
// actually running yet, and reporting it as such would be a regression from
// before Start's reservation was published ahead of the listen.
func (m *Manager) Running() []Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Status, 0, len(m.runs))
	for id, r := range m.runs {
		if r.listener == nil {
			continue
		}
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
