package term

import (
	"encoding/base64"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakePTY is an in-memory PTY: Read blocks until fed via push() or closed,
// Write records input, KeepAlive returns whatever's set. No real SSH.
type fakePTY struct {
	mu         sync.Mutex
	chunks     chan []byte
	written    []byte
	kaErr      error
	kaCalls    int
	rsErr      error
	resizeCols int
	resizeRows int
	closed     bool
	closeOnce  sync.Once
}

func newFakePTY() *fakePTY { return &fakePTY{chunks: make(chan []byte, 64)} }

func (f *fakePTY) push(b []byte) { f.chunks <- b }

func (f *fakePTY) Read(p []byte) (int, error) {
	b, ok := <-f.chunks
	if !ok {
		return 0, io.EOF
	}
	return copy(p, b), nil
}
func (f *fakePTY) Write(p []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.written = append(f.written, p...)
	return len(p), nil
}
func (f *fakePTY) Resize(cols, rows int) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.resizeCols, f.resizeRows = cols, rows
	return f.rsErr
}
func (f *fakePTY) KeepAlive() error {
	f.mu.Lock()
	f.kaCalls++
	f.mu.Unlock()
	return f.kaErr
}
func (f *fakePTY) keepAliveCalls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.kaCalls
}
func (f *fakePTY) Close() error {
	f.closeOnce.Do(func() { f.closed = true; close(f.chunks) })
	return nil
}

// capEmitter records every emitted event in order.
type capEmitter struct {
	mu     sync.Mutex
	events []capEvent
}
type capEvent struct {
	name string
	data any
}

func (c *capEmitter) Emit(name string, data ...any) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, capEvent{name, data[0]})
	return true
}
func (c *capEmitter) outputs() []Output {
	c.mu.Lock()
	defer c.mu.Unlock()
	var out []Output
	for _, e := range c.events {
		if o, ok := e.data.(Output); ok {
			out = append(out, o)
		}
	}
	return out
}
func (c *capEmitter) lastState() (State, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := len(c.events) - 1; i >= 0; i-- {
		if s, ok := c.events[i].data.(State); ok {
			return s, true
		}
	}
	return State{}, false
}

// Many small writes coalesce into far fewer term:data events, seq is strictly
// increasing, and concatenating all Data (base64-decoded) preserves every byte
// in order — nothing dropped, nothing reordered.
func TestPumpCoalescesPreservesBytesAndSeq(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, 15*time.Millisecond, time.Hour) // keep-alive parked
	pty := newFakePTY()
	m.Add("s1", pty)

	var want []byte
	for i := 0; i < 200; i++ {
		b := []byte{byte('a' + i%26)}
		want = append(want, b...)
		pty.push(b)
		time.Sleep(200 * time.Microsecond)
	}
	// Let the flusher drain.
	time.Sleep(80 * time.Millisecond)

	outs := e.outputs()
	if len(outs) == 0 {
		t.Fatal("no term:data emitted")
	}
	if len(outs) >= 200 {
		t.Fatalf("no coalescing: %d events for 200 writes", len(outs))
	}
	var got []byte
	var prev uint64
	for _, o := range outs {
		if o.Seq <= prev {
			t.Fatalf("seq not increasing: %d after %d", o.Seq, prev)
		}
		prev = o.Seq
		dec, err := base64.StdEncoding.DecodeString(o.Data)
		if err != nil {
			t.Fatalf("data not base64: %v", err)
		}
		got = append(got, dec...)
	}
	if string(got) != string(want) {
		t.Fatalf("bytes lost/reordered:\n got %q\nwant %q", got, want)
	}
	_ = m.Close("s1")
}

// A failing keep-alive tears the session down and emits session:state closed
// with ERR_SESSION_CLOSED — the drop path the frontend turns into Reconnect.
func TestKeepAliveFailureClosesSession(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, 15*time.Millisecond) // flush parked, keep-alive fast
	pty := newFakePTY()
	pty.kaErr = errors.New("broken pipe")
	m.Add("s1", pty)

	waitFor(t, 2*time.Second, func() bool {
		s, ok := e.lastState()
		return ok && s.State == StateClosed
	})
	s, _ := e.lastState()
	if s.Code != "ERR_SESSION_CLOSED" || s.SessionID != "s1" {
		t.Fatalf("bad close state: %+v", s)
	}
	if !pty.closed {
		t.Fatal("pty not closed on dead peer")
	}
}

// With "Keep the terminal awake" off the loop keeps ticking but sends no probe,
// so a dead peer is NOT torn down by the keep-alive path — and flipping the
// predicate back on resumes probing.
func TestKeepAliveDisabledSkipsProbe(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, 10*time.Millisecond) // flush parked, keep-alive fast
	// atomic: the predicate is read on the keep-alive goroutine while the test
	// flips it here.
	var awake atomic.Bool
	m.SetKeepAliveEnabled(awake.Load)
	pty := newFakePTY()
	pty.kaErr = errors.New("broken pipe") // would close the session if probed

	m.Add("s1", pty)

	// Several ticks pass with the probe disabled: no KeepAlive call, session stays.
	time.Sleep(60 * time.Millisecond)
	if pty.keepAliveCalls() != 0 {
		t.Fatalf("probe fired while disabled: %d calls", pty.keepAliveCalls())
	}
	if _, ok := e.lastState(); ok {
		if s, _ := e.lastState(); s.State == StateClosed {
			t.Fatal("session closed while keep-alive disabled")
		}
	}

	// Re-enable: the next tick probes, hits kaErr, and closes the session.
	awake.Store(true)
	waitFor(t, 2*time.Second, func() bool {
		s, ok := e.lastState()
		return ok && s.State == StateClosed
	})
	if pty.keepAliveCalls() == 0 {
		t.Fatal("probe never fired after re-enabling")
	}
}

// EOF from Read (remote shell exit) also emits closed. A pty that doesn't
// implement WaitExitClean (like fakePTY) can't be told apart from a drop, so
// it must default to the abnormal-close values.
func TestReaderEOFClosesSession(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, 15*time.Millisecond, time.Hour)
	pty := newFakePTY()
	m.Add("s1", pty)
	_ = pty.Close() // closes chunks → Read returns EOF

	waitFor(t, 2*time.Second, func() bool {
		s, ok := e.lastState()
		return ok && s.State == StateClosed
	})
	s, _ := e.lastState()
	if s.Code != "ERR_SESSION_CLOSED" {
		t.Fatalf("pty without WaitExitClean should be treated as a drop, got %+v", s)
	}
}

// fakePTYWait wraps fakePTY and adds WaitExitClean, so pumpLoop's EOF
// classification takes the "ask the pty" branch instead of defaulting to a
// drop.
type fakePTYWait struct {
	*fakePTY
	clean bool
}

func (f fakePTYWait) WaitExitClean() bool { return f.clean }

// A clean shell exit (WaitExitClean()==true — `exit`/Ctrl-D/exit N) closes the
// session with an empty Code/Message: the frontend's signal to close the pane
// silently, like a real terminal, instead of showing a reconnect notice.
func TestReaderEOFCleanExitEmitsEmptyCode(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, 15*time.Millisecond, time.Hour)
	pty := fakePTYWait{fakePTY: newFakePTY(), clean: true}
	m.Add("s1", pty)
	_ = pty.Close() // closes chunks → Read returns EOF

	waitFor(t, 2*time.Second, func() bool {
		s, ok := e.lastState()
		return ok && s.State == StateClosed
	})
	s, _ := e.lastState()
	if s.Code != "" || s.Message != "" {
		t.Fatalf("clean exit should carry no code/message, got %+v", s)
	}
}

// A shell that ends without a clean exit status (WaitExitClean()==false — no
// exit status, transport gone) is still classified as a drop:
// ERR_SESSION_CLOSED, the same as today, so the frontend still offers
// Reconnect.
func TestReaderEOFUncleanExitEmitsSessionClosed(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, 15*time.Millisecond, time.Hour)
	pty := fakePTYWait{fakePTY: newFakePTY(), clean: false}
	m.Add("s1", pty)
	_ = pty.Close() // closes chunks → Read returns EOF

	waitFor(t, 2*time.Second, func() bool {
		s, ok := e.lastState()
		return ok && s.State == StateClosed
	})
	s, _ := e.lastState()
	if s.Code != "ERR_SESSION_CLOSED" {
		t.Fatalf("unclean exit should be classified as a drop, got %+v", s)
	}
}

// Write base64-decodes and reaches the pty; a bad id errors.
func TestWriteDecodesToPTY(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, time.Hour)
	pty := newFakePTY()
	m.Add("s1", pty)

	if err := m.Write("s1", base64.StdEncoding.EncodeToString([]byte("ls\n"))); err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool {
		pty.mu.Lock()
		defer pty.mu.Unlock()
		return string(pty.written) == "ls\n"
	})
	if err := m.Write("nope", "AA=="); err == nil {
		t.Fatal("write to unknown session should error")
	}
	_ = m.Close("s1")
}

// User Close is silent — no session:state event (the frontend initiated it).
func TestUserCloseIsSilent(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, time.Hour)
	pty := newFakePTY()
	m.Add("s1", pty)
	if err := m.Close("s1"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if _, ok := e.lastState(); ok {
		if s, _ := e.lastState(); s.State == StateClosed {
			t.Fatal("user Close must not emit a closed state")
		}
	}
}

// readLoop must not leak its goroutine when it is blocked SENDING into a full
// dataCh at the moment the session tears down: pty.Close() only unblocks a
// blocked Read, not a blocked channel send, so readLoop must also select on
// r.stop.
//
// This drives readLoop directly against a dataCh that nothing drains (no
// pumpLoop attached), which is the only deterministic way to force the
// blocked-send state: pumpLoop, once running, drains dataCh continuously
// regardless of the flush ticker (it only *emits* on the tick), so racing a
// flood of pushes against Close through the public API would rarely land in
// the backed-up state the fix targets. Here dataCh's 64-slot buffer is
// guaranteed to fill and readLoop is guaranteed to back up on the 65th send.
func TestReadLoopUnblocksOnStopWhenSendBlocked(t *testing.T) {
	pty := newFakePTY()
	r := &runner{pty: pty, stop: make(chan struct{})}

	// Keep feeding the reader so it never blocks on Read — only on the send.
	// Bails out via r.stop too, so this goroutine doesn't leak past the test.
	go func() {
		for i := 0; i < 1000; i++ {
			select {
			case pty.chunks <- []byte{byte('a' + i%26)}:
			case <-r.stop:
				return
			}
		}
	}()

	dataCh := make(chan []byte, 64) // nothing drains this — the pump is "gone"
	m := NewManager(&capEmitter{}, time.Hour, time.Hour)

	done := make(chan struct{})
	go func() {
		m.readLoop(r, dataCh)
		close(done)
	}()

	// Give readLoop time to drain past dataCh's buffer and back up on the
	// send. It must NOT have exited on its own — that would mean this test
	// failed to reach the blocked-send state it's meant to exercise.
	time.Sleep(200 * time.Millisecond)
	select {
	case <-done:
		t.Fatal("readLoop exited before r.stop closed — test didn't reach a blocked-send state")
	default:
	}

	close(r.stop)

	waitFor(t, 2*time.Second, func() bool {
		select {
		case <-done:
			return true
		default:
			return false
		}
	})
}

// CloseAll must tear every session down; a subsequent Write to either errors.
func TestCloseAllRemovesAllSessions(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, time.Hour)
	pty1 := newFakePTY()
	pty2 := newFakePTY()
	m.Add("s1", pty1)
	m.Add("s2", pty2)

	m.CloseAll()

	if err := m.Write("s1", "AA=="); err == nil {
		t.Fatal("s1 should be gone after CloseAll")
	}
	if err := m.Write("s2", "AA=="); err == nil {
		t.Fatal("s2 should be gone after CloseAll")
	}
}

// Resize forwards cols/rows to the pty and surfaces its error; an unknown
// session id errors without touching any pty.
func TestResizeForwardsToPTYAndPropagatesError(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, time.Hour)
	pty := newFakePTY()
	m.Add("s1", pty)

	if err := m.Resize("s1", 120, 40); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pty.mu.Lock()
	gotCols, gotRows := pty.resizeCols, pty.resizeRows
	pty.mu.Unlock()
	if gotCols != 120 || gotRows != 40 {
		t.Fatalf("resize not forwarded: got %dx%d, want 120x40", gotCols, gotRows)
	}

	pty.rsErr = errors.New("ioctl failed")
	if err := m.Resize("s1", 80, 24); err == nil {
		t.Fatal("expected pty resize error to propagate")
	}

	if err := m.Resize("nope", 80, 24); err == nil {
		t.Fatal("resize on unknown session should error")
	}
	_ = m.Close("s1")
}

// Write rejects input that isn't valid base64 before it ever reaches the pty.
func TestWriteRejectsMalformedBase64(t *testing.T) {
	e := &capEmitter{}
	m := NewManager(e, time.Hour, time.Hour)
	pty := newFakePTY()
	m.Add("s1", pty)

	if err := m.Write("s1", "not-valid-base64!!"); err == nil {
		t.Fatal("expected malformed base64 to error")
	}
	pty.mu.Lock()
	wrote := len(pty.written)
	pty.mu.Unlock()
	if wrote != 0 {
		t.Fatalf("malformed input must not reach the pty, got %d bytes written", wrote)
	}
	_ = m.Close("s1")
}

func waitFor(t *testing.T, d time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met within deadline")
}
