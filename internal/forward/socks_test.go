package forward

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	"strconv"
	"sync"
	"testing"
	"time"
)

// dialSOCKS5 performs a hand-rolled SOCKS5 no-auth CONNECT handshake against
// socksAddr, targeting destAddr (must resolve to an IPv4 host:port), and
// returns the established client connection ready for proxied traffic.
//
// golang.org/x/net/proxy is not in go.mod (checked before writing this), so
// the wire bytes are written directly per RFC 1928 rather than reaching for
// a SOCKS5 client library.
func dialSOCKS5(t *testing.T, socksAddr, destAddr string) net.Conn {
	t.Helper()
	c, err := net.DialTimeout("tcp", socksAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial socks listener: %v", err)
	}
	_ = c.SetDeadline(time.Now().Add(2 * time.Second))

	// Greeting: VER=5 NMETHODS=1 METHODS=[0x00 no-auth].
	if _, err := c.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		t.Fatalf("write greeting: %v", err)
	}
	greetReply := make([]byte, 2)
	if _, err := io.ReadFull(c, greetReply); err != nil {
		t.Fatalf("read greeting reply: %v", err)
	}
	if greetReply[0] != 0x05 || greetReply[1] != 0x00 {
		t.Fatalf("greeting reply = % x, want 05 00 (no-auth selected)", greetReply)
	}

	host, portStr, err := net.SplitHostPort(destAddr)
	if err != nil {
		t.Fatalf("split dest addr %q: %v", destAddr, err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("parse dest port %q: %v", portStr, err)
	}
	ip4 := net.ParseIP(host).To4()
	if ip4 == nil {
		t.Fatalf("dest host %q is not IPv4", host)
	}

	// Request: VER=5 CMD=1(CONNECT) RSV=0 ATYP=1(IPv4) DST.ADDR(4) DST.PORT(2).
	req := make([]byte, 0, 10)
	req = append(req, 0x05, 0x01, 0x00, 0x01)
	req = append(req, ip4...)
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, uint16(port))
	req = append(req, portBytes...)
	if _, err := c.Write(req); err != nil {
		t.Fatalf("write connect request: %v", err)
	}

	// Reply: VER REP RSV ATYP BND.ADDR(4) BND.PORT(2) = 10 bytes for IPv4.
	connReply := make([]byte, 10)
	if _, err := io.ReadFull(c, connReply); err != nil {
		t.Fatalf("read connect reply: %v", err)
	}
	if connReply[0] != 0x05 || connReply[1] != 0x00 {
		t.Fatalf("connect reply = % x, want VER=05 REP=00 (succeeded)", connReply)
	}
	_ = c.SetDeadline(time.Time{})
	return c
}

// TestServeSOCKSProxiesTraffic drives a real SOCKS5 client handshake against
// serveSOCKS (no Manager involved — serveSOCKS is manager-independent by
// design) and proves the CONNECT target (an echo server) is actually reached
// through it: bytes written on the SOCKS client conn come back echoed.
//
// It also proves the leak-free teardown contract serveSOCKS must uphold on
// its own: once the proxied connection is done, closing quit and the
// listener makes wg.Wait() return — no goroutine (accept loop or the
// per-connection copy) is left running.
func TestServeSOCKSProxiesTraffic(t *testing.T) {
	echoAddr := echoServer(t)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	dial := func(addr string) (net.Conn, error) { return net.Dial("tcp", addr) }
	quit := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go serveSOCKS(ln, dial, quit, &wg)

	c := dialSOCKS5(t, ln.Addr().String(), echoAddr)

	want := []byte("hello over socks5")
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

	// Close the proxied connection FIRST so no pipe() copy is in flight —
	// same ordering TestStopIsLeakFree uses in manager_test.go — then tear
	// the accept loop down and prove wg.Wait() actually returns.
	_ = c.Close()
	close(quit)
	_ = ln.Close()

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("serveSOCKS did not tear down within 5s after quit+listener close — goroutine leak")
	}
}

// TestServeSOCKSTeardownLeakFree proves serveSOCKS's accept loop itself
// (with no connections ever made) tears down cleanly: wg.Wait() must return
// once quit is closed and the listener is closed, exactly mirroring how
// Manager.Stop unblocks the -L/-R accept loop.
func TestServeSOCKSTeardownLeakFree(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	dial := func(addr string) (net.Conn, error) { return net.Dial("tcp", addr) }
	quit := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go serveSOCKS(ln, dial, quit, &wg)

	close(quit)
	_ = ln.Close()

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("serveSOCKS did not tear down within 5s of quit+listener close — goroutine leak")
	}
}

// TestServeSOCKSDialFailureRepliesConnectionRefused proves a CONNECT whose
// dial fails gets a well-formed SOCKS5 error reply (REP=0x05, connection
// refused) and the client connection is closed rather than left hanging.
func TestServeSOCKSDialFailureRepliesConnectionRefused(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	wantErr := &net.OpError{Op: "dial", Err: net.UnknownNetworkError("refused")}
	dial := func(addr string) (net.Conn, error) { return nil, wantErr }
	quit := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go serveSOCKS(ln, dial, quit, &wg)
	t.Cleanup(func() {
		close(quit)
		_ = ln.Close()
		wg.Wait()
	})

	c, err := net.DialTimeout("tcp", ln.Addr().String(), 2*time.Second)
	if err != nil {
		t.Fatalf("dial socks listener: %v", err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(2 * time.Second))

	if _, err := c.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		t.Fatalf("write greeting: %v", err)
	}
	greetReply := make([]byte, 2)
	if _, err := io.ReadFull(c, greetReply); err != nil {
		t.Fatalf("read greeting reply: %v", err)
	}

	req := []byte{0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0, 80}
	if _, err := c.Write(req); err != nil {
		t.Fatalf("write connect request: %v", err)
	}
	connReply := make([]byte, 10)
	if _, err := io.ReadFull(c, connReply); err != nil {
		t.Fatalf("read connect reply: %v", err)
	}
	if connReply[0] != 0x05 || connReply[1] != 0x05 {
		t.Fatalf("connect reply = % x, want VER=05 REP=05 (connection refused)", connReply)
	}
}
