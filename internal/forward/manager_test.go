package forward

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net"
	"strconv"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// echoServer starts an in-process TCP server that echoes back whatever it
// reads, and returns its listen address. It closes on test cleanup.
func echoServer(t *testing.T) (addr string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() { _, _ = io.Copy(c, c); _ = c.Close() }()
		}
	}()
	return ln.Addr().String()
}

// startForwardingSSHServer starts an in-process SSH server that behaves like
// a bastion: it accepts direct-tcpip channels and pipes them to the
// requested address, so a client's Client.Dial tunnels through it — the same
// shape a real -L forward's remote-side dial needs. Modeled directly on
// internal/sshx/testserver_test.go's newJumpTestServer (unexported there, so
// it can't be reused directly from this package). It closes on test cleanup.
func startForwardingSSHServer(t *testing.T) (addr string, hostKey ssh.PublicKey) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromSigner(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for ch := range chans {
						if ch.ChannelType() != "direct-tcpip" {
							_ = ch.Reject(ssh.Prohibited, "only direct-tcpip")
							continue
						}
						var p struct {
							DestHost string
							DestPort uint32
							SrcHost  string
							SrcPort  uint32
						}
						if err := ssh.Unmarshal(ch.ExtraData(), &p); err != nil {
							_ = ch.Reject(ssh.ConnectionFailed, "bad payload")
							continue
						}
						upstream, err := net.Dial("tcp", net.JoinHostPort(p.DestHost, strconv.Itoa(int(p.DestPort))))
						if err != nil {
							_ = ch.Reject(ssh.ConnectionFailed, err.Error())
							continue
						}
						channel, chReqs, err := ch.Accept()
						if err != nil {
							_ = upstream.Close()
							continue
						}
						go ssh.DiscardRequests(chReqs)
						go func() { _, _ = io.Copy(channel, upstream); _ = channel.Close() }()
						go func() { _, _ = io.Copy(upstream, channel); _ = upstream.Close() }()
					}
				}()
				_ = sc.Wait()
			}()
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

// dialConn dials the given in-process SSH server and returns a real
// *sshx.Conn wrapping the client, for use as Manager.Start's conn argument.
//
// The host key is pinned with ssh.FixedHostKey(hostKey) — the exact key
// startForwardingSSHServer just generated and returned — rather than the
// x/crypto helper that skips host-key verification entirely (SEC-02 bans
// that helper repo-wide; Taskfile.yml's check target greps for its literal
// name across every *.go file with no _test.go exclusion, so reaching for it
// even here would trip the gate). FixedHostKey needs no such exception: it's
// the same "pin the key we already know" pattern internal/sshx's own tests
// use (see client_test.go), and for a throwaway in-process server it
// verifies exactly as much as skipping verification would have skipped.
func dialConn(t *testing.T, addr string, hostKey ssh.PublicKey) *sshx.Conn {
	t.Helper()
	cc := &ssh.ClientConfig{User: "x", Auth: nil, HostKeyCallback: ssh.FixedHostKey(hostKey)}
	client, err := ssh.Dial("tcp", addr, cc)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return &sshx.Conn{Client: client}
}

// freePort reserves an ephemeral TCP port on 127.0.0.1 by listening then
// immediately closing, so the caller can hand a KNOWN port number to
// Manager.Start (which needs a fixed BindPort, not ":0"). There's a small
// window where another process could grab the port before Start binds it;
// accepted as the standard trade-off for this kind of test.
func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	_, portStr, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	if err := ln.Close(); err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatal(err)
	}
	return port
}

// splitPort returns the numeric port from a "host:port" address.
func splitPort(t *testing.T, addr string) int {
	t.Helper()
	_, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatal(err)
	}
	return port
}

func TestStartLocalForwardTraffic(t *testing.T) {
	echoAddr := echoServer(t)
	sshAddr, hostKey := startForwardingSSHServer(t)
	conn := dialConn(t, sshAddr, hostKey)

	bindPort := freePort(t)
	fwd := domain.PortForward{
		ID:       "fwd-1",
		Type:     domain.ForwardLocal,
		BindAddr: "127.0.0.1",
		BindPort: bindPort,
		DestHost: "127.0.0.1",
		DestPort: splitPort(t, echoAddr),
	}

	var mu sync.Mutex
	var events []Status
	m := NewManager(func(s Status) {
		mu.Lock()
		events = append(events, s)
		mu.Unlock()
	})

	if err := m.Start(fwd, conn); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(m.StopAll)

	if got := m.Status(fwd.ID); got.State != StateRunning {
		t.Fatalf("Status after Start = %+v, want running", got)
	}

	c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort)), 2*time.Second)
	if err != nil {
		t.Fatalf("dial forward bind addr: %v", err)
	}
	defer func() { _ = c.Close() }()

	want := []byte("hello through the tunnel")
	if _, err := c.Write(want); err != nil {
		t.Fatalf("write: %v", err)
	}
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	got := make([]byte, len(want))
	if _, err := io.ReadFull(c, got); err != nil {
		t.Fatalf("read echo: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("echoed = %q, want %q", got, want)
	}

	if err := m.Stop(fwd.ID); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got := m.Status(fwd.ID); got.State != StateStopped {
		t.Fatalf("Status after Stop = %+v, want stopped", got)
	}

	// Listener is closed: a fresh dial to the bind addr must now fail.
	if c2, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort)), 500*time.Millisecond); err == nil {
		_ = c2.Close()
		t.Fatal("dial after Stop unexpectedly succeeded")
	}

	mu.Lock()
	defer mu.Unlock()
	if len(events) == 0 {
		t.Fatal("expected at least one emitted Status")
	}
}

// TestStopIsLeakFree proves Stop's r.wg.Wait() actually joins every goroutine
// the runner spawned (the accept loop AND every per-connection pipe): after
// Stop returns, a follow-up Start reusing the SAME forward ID must succeed.
// If Stop returned early while some goroutine of the old runner were still
// alive, the map entry could still be present (or removed too early while a
// stray goroutine still touches the closed conn/listener), and this
// resurrection is the most direct behavioral proof available without
// exporting internal goroutine counts. Run with -race so any lingering
// concurrent access to shared state (map, conn, listener) after Stop would
// also be caught directly.
func TestStopIsLeakFree(t *testing.T) {
	echoAddr := echoServer(t)
	m := NewManager(nil)

	const id = "reused-id"
	bindPort := freePort(t)

	start := func() *sshx.Conn {
		sshAddr, hostKey := startForwardingSSHServer(t)
		conn := dialConn(t, sshAddr, hostKey)
		fwd := domain.PortForward{
			ID: id, Type: domain.ForwardLocal,
			BindAddr: "127.0.0.1", BindPort: bindPort,
			DestHost: "127.0.0.1", DestPort: splitPort(t, echoAddr),
		}
		if err := m.Start(fwd, conn); err != nil {
			t.Fatalf("Start: %v", err)
		}
		return conn
	}

	start()

	// Drive some real traffic through it so accept spawns a per-connection
	// copy goroutine (not just the bare accept loop) before we tear down.
	c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort)), 2*time.Second)
	if err != nil {
		t.Fatalf("dial forward bind addr: %v", err)
	}
	if _, err := c.Write([]byte("ping")); err != nil {
		t.Fatalf("write: %v", err)
	}
	buf := make([]byte, 4)
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := io.ReadFull(c, buf); err != nil {
		t.Fatalf("read echo: %v", err)
	}
	_ = c.Close()

	if err := m.Stop(id); err != nil {
		t.Fatalf("Stop: %v", err)
	}

	// The listener and its port are free again — a follow-up Start with the
	// SAME id on the SAME port must succeed with no leftover state.
	start()
	t.Cleanup(func() { _ = m.Stop(id) })

	if got := m.Status(id); got.State != StateRunning {
		t.Fatalf("Status after re-Start = %+v, want running", got)
	}
}

// TestStopIsPromptWithConnectionHeldOpen proves the other half of leak-free
// teardown that TestStopIsLeakFree doesn't reach: that closes the tunneled
// conn BEFORE calling Stop, so no pipe() copy is actually in flight when
// Stop's r.wg.Wait() runs. Here the tunneled connection is left OPEN across
// Stop, so both of pipe()'s io.Copy goroutines are genuinely parked in a
// blocking Read (one on the forward's accepted conn, one on the SSH-dialed
// conn to the echo server) at the moment Stop runs. The only thing that can
// unblock those Reads is Stop closing r.conn out from under them (see Stop's
// doc comment); if that mechanism ever regressed — e.g. someone reordered
// Stop's teardown, or made it wait before closing conn — Stop would hang on
// r.wg.Wait() until the OS's own TCP idle/keepalive behavior eventually gave
// up (which, unbounded, could be a very long time). The 5s timeout below
// turns that into a fast, deterministic test failure instead of a wedged
// test run, so a regression of I1/I2's promptness guarantees fails loudly.
func TestStopIsPromptWithConnectionHeldOpen(t *testing.T) {
	echoAddr := echoServer(t)
	sshAddr, hostKey := startForwardingSSHServer(t)
	conn := dialConn(t, sshAddr, hostKey)

	bindPort := freePort(t)
	fwd := domain.PortForward{
		ID: "hold-open", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: bindPort,
		DestHost: "127.0.0.1", DestPort: splitPort(t, echoAddr),
	}

	m := NewManager(nil)
	if err := m.Start(fwd, conn); err != nil {
		t.Fatalf("Start: %v", err)
	}

	c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort)), 2*time.Second)
	if err != nil {
		t.Fatalf("dial forward bind addr: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })

	// Drive one round trip so accept() has actually spawned the per-connection
	// copy goroutine and pipe() is running (not just the bare accept loop),
	// then deliberately leave c OPEN: both io.Copy directions inside pipe()
	// are now blocked waiting for more data that never comes, until Stop
	// closes the underlying conns.
	if _, err := c.Write([]byte("ping")); err != nil {
		t.Fatalf("write: %v", err)
	}
	buf := make([]byte, 4)
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := io.ReadFull(c, buf); err != nil {
		t.Fatalf("read echo: %v", err)
	}

	done := make(chan error, 1)
	go func() { done <- m.Stop(fwd.ID) }()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Stop: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Stop did not return within 5s with a tunneled connection held open across it — pipe()'s blocked Read likely didn't unblock (conn.Close() regression)")
	}

	if got := m.Status(fwd.ID); got.State != StateStopped {
		t.Fatalf("Status after Stop = %+v, want stopped", got)
	}
}

func TestStartBindErrorAlreadyInUse(t *testing.T) {
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = occupied.Close() }()
	port := splitPort(t, occupied.Addr().String())

	sshAddr, hostKey := startForwardingSSHServer(t)
	conn := dialConn(t, sshAddr, hostKey)

	m := NewManager(nil)
	fwd := domain.PortForward{
		ID: "bad-bind", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: port,
		DestHost: "127.0.0.1", DestPort: 9,
	}
	if err := m.Start(fwd, conn); err == nil {
		t.Fatal("Start on an already-bound port unexpectedly succeeded")
	}
	if got := m.Status(fwd.ID); got.State != StateError {
		t.Fatalf("Status after bind failure = %+v, want error", got)
	}

	// Manager took ownership of conn and must have closed it on this
	// failure path — a closed ssh.Client rejects new operations.
	if _, err := conn.Client.NewSession(); err == nil {
		t.Fatal("conn.Client still usable after Start's bind-error path; expected it closed")
	}
}

// TestStartRemoteForwardAgainstNonForwardingServer is the best-effort -R
// coverage the brief allows in place of a full remote-forward integration
// test: startForwardingSSHServer only handles direct-tcpip channels (the -L
// path), so it has no "tcpip-forward" global-request handler and
// conn.Client.Listen (the -R path) must fail against it. This at least
// exercises that Start's ForwardRemote branch calls conn.Client.Listen and
// reports StateError on failure, closing conn. Full -R traffic (a real
// remote-forward-capable server) is deferred to the manual macOS test per
// the task brief.
func TestStartRemoteForwardAgainstNonForwardingServer(t *testing.T) {
	sshAddr, hostKey := startForwardingSSHServer(t)
	conn := dialConn(t, sshAddr, hostKey)

	m := NewManager(nil)
	fwd := domain.PortForward{
		ID: "remote-1", Type: domain.ForwardRemote,
		BindAddr: "127.0.0.1", BindPort: freePort(t),
		DestHost: "127.0.0.1", DestPort: 9,
	}
	if err := m.Start(fwd, conn); err == nil {
		t.Fatal("Start(-R) against a server with no remote-forward support unexpectedly succeeded")
	}
	if got := m.Status(fwd.ID); got.State != StateError {
		t.Fatalf("Status after -R failure = %+v, want error", got)
	}
}

// TestStartDynamicForwardTraffic proves the -D (SOCKS5) path end-to-end
// through the Manager: Start opens a local listener that speaks SOCKS5, a
// real SOCKS5 client CONNECTs through it to an echo server, and the proxied
// destination is actually dialed over the jump chain (conn.Client.Dial
// against startForwardingSSHServer's direct-tcpip handler) — the same shape
// -L's own traffic test proves for its path.
func TestStartDynamicForwardTraffic(t *testing.T) {
	echoAddr := echoServer(t)
	sshAddr, hostKey := startForwardingSSHServer(t)
	conn := dialConn(t, sshAddr, hostKey)

	bindPort := freePort(t)
	fwd := domain.PortForward{
		ID:       "fwd-d1",
		Type:     domain.ForwardDynamic,
		BindAddr: "127.0.0.1",
		BindPort: bindPort,
		// No DestHost/DestPort: -D negotiates its destination per-connection.
	}

	var mu sync.Mutex
	var events []Status
	m := NewManager(func(s Status) {
		mu.Lock()
		events = append(events, s)
		mu.Unlock()
	})

	if err := m.Start(fwd, conn); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(m.StopAll)

	if got := m.Status(fwd.ID); got.State != StateRunning {
		t.Fatalf("Status after Start = %+v, want running", got)
	}

	socksAddr := net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort))
	c := dialSOCKS5(t, socksAddr, echoAddr)

	want := []byte("hello through the socks5 tunnel")
	if _, err := c.Write(want); err != nil {
		t.Fatalf("write: %v", err)
	}
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	got := make([]byte, len(want))
	if _, err := io.ReadFull(c, got); err != nil {
		t.Fatalf("read echo: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("echoed = %q, want %q", got, want)
	}
	_ = c.Close()

	if err := m.Stop(fwd.ID); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got := m.Status(fwd.ID); got.State != StateStopped {
		t.Fatalf("Status after Stop = %+v, want stopped", got)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(events) == 0 {
		t.Fatal("expected at least one emitted Status")
	}
}

// TestStopIsLeakFreeDynamic is TestStopIsLeakFree's -D counterpart: it
// proves Stop's r.wg.Wait() actually joins every goroutine the -D runner
// spawned — the acceptDynamic wrapper goroutine, serveSOCKS's own accept
// loop, AND the per-connection SOCKS copy — by reusing the same forward ID
// (and bind port) for a follow-up Start immediately after Stop. If any of
// those goroutines were still alive when Stop returned, either the port
// would still be bound (Start's Listen would fail) or the map entry
// wouldn't really be free, so this is the most direct behavioral proof of
// leak-free teardown available for the -D-specific teardown bridge
// (acceptDynamic) without exporting internal goroutine counts.
func TestStopIsLeakFreeDynamic(t *testing.T) {
	echoAddr := echoServer(t)
	m := NewManager(nil)

	const id = "reused-id-d"
	bindPort := freePort(t)

	start := func() *sshx.Conn {
		sshAddr, hostKey := startForwardingSSHServer(t)
		conn := dialConn(t, sshAddr, hostKey)
		fwd := domain.PortForward{
			ID: id, Type: domain.ForwardDynamic,
			BindAddr: "127.0.0.1", BindPort: bindPort,
		}
		if err := m.Start(fwd, conn); err != nil {
			t.Fatalf("Start: %v", err)
		}
		return conn
	}

	start()

	// Drive real traffic through it so serveSOCKS's accept loop spawns a
	// per-connection copy goroutine (not just the bare accept loop) before
	// tearing down.
	socksAddr := net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort))
	c := dialSOCKS5(t, socksAddr, echoAddr)
	if _, err := c.Write([]byte("ping")); err != nil {
		t.Fatalf("write: %v", err)
	}
	buf := make([]byte, 4)
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := io.ReadFull(c, buf); err != nil {
		t.Fatalf("read echo: %v", err)
	}
	_ = c.Close()

	if err := m.Stop(id); err != nil {
		t.Fatalf("Stop: %v", err)
	}

	// The listener and its port are free again — a follow-up Start with the
	// SAME id on the SAME port must succeed with no leftover state.
	start()
	t.Cleanup(func() { _ = m.Stop(id) })

	if got := m.Status(id); got.State != StateRunning {
		t.Fatalf("Status after re-Start = %+v, want running", got)
	}
}

// TestStopIsPromptWithConnectionHeldOpenDynamic is -D's counterpart to
// TestStopIsPromptWithConnectionHeldOpen: it leaves the proxied SOCKS5
// connection OPEN across Stop, so pipe()'s two io.Copy goroutines (one on
// the SOCKS client conn serveSOCKS accepted, one on the upstream conn
// r.conn.Client.Dial produced) are genuinely blocked in a Read at the moment
// Stop runs — exactly the scenario acceptDynamic's doc comment reasons
// about. The only thing that can unblock those Reads is Stop's
// r.conn.Close() (the same mechanism -L relies on, and the one
// acceptDynamic's dial closure rides via r.conn.Client.Dial); if that
// stopped working for the -D path, Stop would hang on r.wg.Wait() until the
// OS's own TCP idle behavior eventually gave up. The 5s timeout turns a
// regression here into a fast, deterministic failure instead of a wedged
// test run.
func TestStopIsPromptWithConnectionHeldOpenDynamic(t *testing.T) {
	echoAddr := echoServer(t)
	sshAddr, hostKey := startForwardingSSHServer(t)
	conn := dialConn(t, sshAddr, hostKey)

	bindPort := freePort(t)
	fwd := domain.PortForward{
		ID: "hold-open-d", Type: domain.ForwardDynamic,
		BindAddr: "127.0.0.1", BindPort: bindPort,
	}

	m := NewManager(nil)
	if err := m.Start(fwd, conn); err != nil {
		t.Fatalf("Start: %v", err)
	}

	socksAddr := net.JoinHostPort("127.0.0.1", strconv.Itoa(bindPort))
	c := dialSOCKS5(t, socksAddr, echoAddr)
	t.Cleanup(func() { _ = c.Close() })

	// Drive one round trip so the per-connection copy goroutine is actually
	// running (not just the bare accept loop), then deliberately leave c
	// OPEN across Stop.
	if _, err := c.Write([]byte("ping")); err != nil {
		t.Fatalf("write: %v", err)
	}
	buf := make([]byte, 4)
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := io.ReadFull(c, buf); err != nil {
		t.Fatalf("read echo: %v", err)
	}

	done := make(chan error, 1)
	go func() { done <- m.Stop(fwd.ID) }()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Stop: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Stop did not return within 5s with a proxied -D connection held open across it — pipe()'s blocked Read likely didn't unblock (r.conn.Close() regression)")
	}

	if got := m.Status(fwd.ID); got.State != StateStopped {
		t.Fatalf("Status after Stop = %+v, want stopped", got)
	}
}
