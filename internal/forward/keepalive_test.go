package forward

import (
	"io"
	"net"
	"strconv"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// statusLog collects emitted statuses and waits for one.
type statusLog struct {
	mu  sync.Mutex
	got []Status
}

func (l *statusLog) emit(s Status) {
	l.mu.Lock()
	l.got = append(l.got, s)
	l.mu.Unlock()
}

func (l *statusLog) waitFor(t *testing.T, id string, state State) Status {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		l.mu.Lock()
		for _, s := range l.got {
			if s.ForwardID == id && s.State == state {
				l.mu.Unlock()
				return s
			}
		}
		l.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no %s status for %s within 5s", state, id)
	return Status{}
}

// neverAnswer reads global requests and leaves each one unanswered, like a
// server whose link died without a reset.
func neverAnswer(reqs <-chan *ssh.Request) {
	for req := range reqs {
		_ = req
	}
}

func localForward(t *testing.T, id, echoAddr string) domain.PortForward {
	return domain.PortForward{
		ID: id, Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: freePort(t),
		DestHost: "127.0.0.1", DestPort: splitPort(t, echoAddr),
	}
}

func roundTrip(t *testing.T, port int, msg string) {
	t.Helper()
	c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), 2*time.Second)
	if err != nil {
		t.Fatalf("dial tunnel: %v", err)
	}
	defer func() { _ = c.Close() }()
	if _, err := c.Write([]byte(msg)); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, len(msg))
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := io.ReadFull(c, buf); err != nil {
		t.Fatalf("read echo: %v", err)
	}
}

func TestLocalTunnelTearsDownWhenServerDropsConnection(t *testing.T) {
	var mu sync.Mutex
	var server []*ssh.ServerConn
	sshAddr, hostKey := startSSHServer(t, func(r <-chan *ssh.Request) { ssh.DiscardRequests(r) }, func(sc *ssh.ServerConn) {
		mu.Lock()
		server = append(server, sc)
		mu.Unlock()
	})
	log := &statusLog{}
	m := NewManager(log.emit)
	fwd := localForward(t, "drop", echoServer(t))
	if err := m.Start(fwd, dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	for _, sc := range server {
		_ = sc.Close()
	}
	mu.Unlock()

	if st := log.waitFor(t, "drop", StateError); st.Detail != detailClosed {
		t.Fatalf("detail = %q, want %q", st.Detail, detailClosed)
	}
	if len(m.Running()) != 0 {
		t.Fatal("a dropped tunnel still reports as running")
	}
	// The listener is gone too, so the same port can be taken again.
	ln, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(fwd.BindPort)))
	if err != nil {
		t.Fatalf("port still held after the drop: %v", err)
	}
	_ = ln.Close()
}

func TestKeepAliveTearsDownSilentServer(t *testing.T) {
	sshAddr, hostKey := startSSHServer(t, neverAnswer, nil)
	log := &statusLog{}
	m := NewManager(log.emit)
	m.SetKeepAlive(30*time.Millisecond, 80*time.Millisecond)
	if err := m.Start(localForward(t, "silent", echoServer(t)), dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}
	if st := log.waitFor(t, "silent", StateError); st.Detail != detailSilent {
		t.Fatalf("detail = %q, want %q", st.Detail, detailSilent)
	}
}

func TestKeepAliveKeepsHealthyTunnel(t *testing.T) {
	sshAddr, hostKey := startForwardingSSHServer(t)
	m := NewManager(nil)
	m.SetKeepAlive(20*time.Millisecond, time.Second)
	fwd := localForward(t, "healthy", echoServer(t))
	if err := m.Start(fwd, dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Stop("healthy") })
	time.Sleep(150 * time.Millisecond)
	m.ProbeAll()
	time.Sleep(50 * time.Millisecond)
	if st := m.Status("healthy"); st.State != StateRunning {
		t.Fatalf("healthy tunnel = %+v after probes, want running", st)
	}
	roundTrip(t, fwd.BindPort, "still")
}

func TestProbeAllTearsDownDeadConnection(t *testing.T) {
	sshAddr, hostKey := startSSHServer(t, neverAnswer, nil)
	log := &statusLog{}
	m := NewManager(log.emit)
	m.SetKeepAlive(0, 80*time.Millisecond) // periodic probing off: only ProbeAll can find it
	if err := m.Start(localForward(t, "wake", echoServer(t)), dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}
	m.ProbeAll()
	log.waitFor(t, "wake", StateError)
}

func TestStopIsLeakFreeWithProbeInFlight(t *testing.T) {
	sshAddr, hostKey := startSSHServer(t, neverAnswer, nil)
	m := NewManager(nil)
	m.SetKeepAlive(0, time.Hour)
	if err := m.Start(localForward(t, "inflight", echoServer(t)), dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}
	m.ProbeAll() // parks a probe waiting for an answer that never comes
	done := make(chan struct{})
	go func() { _ = m.Stop("inflight"); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Stop did not return with a probe in flight")
	}
	if st := m.Status("inflight"); st.State != StateStopped {
		t.Fatalf("status = %+v, want stopped", st)
	}
}

func TestTrafficCountsBytesAndRotates(t *testing.T) {
	sshAddr, hostKey := startForwardingSSHServer(t)
	m := NewManager(nil)
	fwd := localForward(t, "traffic", echoServer(t))
	if err := m.Start(fwd, dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}
	roundTrip(t, fwd.BindPort, "ping")

	first := m.Tick()
	if len(first) != 1 || first[0].ForwardID != "traffic" {
		t.Fatalf("Tick = %+v, want one tunnel", first)
	}
	if b := first[0].Buckets; len(b) != TrafficBuckets || b[TrafficBuckets-1] != 8 || first[0].Total != 8 {
		t.Fatalf("first bucket = %+v, want 8 bytes (4 out, 4 back) in the newest slot", first[0])
	}
	second := m.Tick()
	if b := second[0].Buckets; b[TrafficBuckets-2] != 8 || b[TrafficBuckets-1] != 0 || second[0].Total != 8 {
		t.Fatalf("second tick = %+v, want the 8 bytes shifted one slot older", second[0])
	}

	if err := m.Stop("traffic"); err != nil {
		t.Fatal(err)
	}
	if got := m.Traffic(); len(got) != 0 {
		t.Fatalf("Traffic after Stop = %+v, want none", got)
	}
}

func TestTrafficSurvivesSelfTeardownAndAgesOut(t *testing.T) {
	sshAddr, hostKey := startForwardingSSHServer(t)
	log := &statusLog{}
	m := NewManager(log.emit)
	fwd := localForward(t, "aging", echoServer(t))
	conn := dialConn(t, sshAddr, hostKey)
	if err := m.Start(fwd, conn); err != nil {
		t.Fatal(err)
	}
	roundTrip(t, fwd.BindPort, "hi")
	_ = conn.Client.Close() // the connection dies under the tunnel
	log.waitFor(t, "aging", StateError)

	if got := m.Tick(); len(got) != 1 || got[0].Total != 4 {
		t.Fatalf("Tick after a drop = %+v, want the history kept for a reconnect", got)
	}
	for range TrafficBuckets - 1 {
		m.Tick()
	}
	if got := m.Tick(); len(got) != 0 {
		t.Fatalf("a stopped, quiet tunnel is still reported: %+v", got)
	}
}

func TestReportIdleNeverMasksARunningTunnel(t *testing.T) {
	sshAddr, hostKey := startForwardingSSHServer(t)
	log := &statusLog{}
	m := NewManager(log.emit)
	fwd := localForward(t, "idle", echoServer(t))
	if err := m.Start(fwd, dialConn(t, sshAddr, hostKey)); err != nil {
		t.Fatal(err)
	}
	if m.ReportIdle("idle", StateRetrying, "x") {
		t.Fatal("ReportIdle overwrote a running tunnel")
	}
	if st := m.Status("idle"); st.State != StateRunning {
		t.Fatalf("status = %+v, want running", st)
	}
	_ = m.Stop("idle")
	if !m.ReportIdle("idle", StateRetrying, "waiting") {
		t.Fatal("ReportIdle refused an idle forward")
	}
	if st := m.Status("idle"); st.State != StateRetrying || st.Detail != "waiting" {
		t.Fatalf("status = %+v, want retrying", st)
	}
	if n := len(m.Statuses()); n != 1 {
		t.Fatalf("Statuses = %d entries, want 1", n)
	}
}
