package forward

import (
	"encoding/binary"
	"io"
	"net"
	"strconv"
	"sync"
)

// SOCKS5 wire constants (RFC 1928). Only what a no-auth, CONNECT-only server
// needs.
const (
	socks5Ver = 0x05

	socks5MethodNoAuth  = 0x00
	socks5MethodNoAcpt  = 0xFF // "no acceptable methods"
	socks5CmdConnect    = 0x01
	socks5AtypIPv4      = 0x01
	socks5AtypDomain    = 0x03
	socks5AtypIPv6      = 0x04
	socks5RepSucceeded  = 0x00
	socks5RepCmdNotSupp = 0x07
	socks5RepAtypNotSup = 0x08
	socks5RepConnRefuse = 0x05
)

// serveSOCKS runs a SOCKS5 (no-auth, CONNECT-only) accept loop on ln. Each
// client connection is handshaked and its CONNECT target is dialed via
// dial(addr) — which the Manager wires to conn.Client.Dial so the proxied
// TCP rides the jump chain. Every goroutine is tracked in wg and stops on
// quit.
//
// serveSOCKS is deliberately Manager-independent — it has no reference to a
// *Manager and reports nothing beyond wg — so it can be driven directly in
// tests (socks_test.go) without standing up a Manager/runner at all. Its
// caller (in this package, the Manager's -D accept wrapper; in a test, the
// test itself) is the one that:
//   - calls wg.Add(1) BEFORE launching serveSOCKS, exactly like Start does
//     before `go m.accept(...)` — serveSOCKS's own `defer wg.Done()` below
//     is the matching Done() for that Add(1), not one it performs itself.
//   - closes quit and ln to signal shutdown: closing ln is what actually
//     unblocks the blocked Accept() call below (quit itself is never
//     selected on inside this loop, exactly mirroring how accept() in
//     manager.go is unblocked by listener.Close(), not by a select on
//     r.quit) — quit is threaded through only so a caller wiring this into
//     something with a quit-vs-error distinction (like the Manager) can
//     inspect the SAME channel after serveSOCKS returns, to tell a
//     deliberate shutdown apart from a real accept error.
//
// On ANY Accept() error (deliberate close or a real failure) the loop just
// returns — same as manager.go's accept(), which doesn't retry either — so
// the function always tears down cleanly regardless of which caused it.
func serveSOCKS(ln net.Listener, dial func(addr string) (net.Conn, error), quit <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	_ = quit // see doc comment: interpreted by the caller after this returns, not selected on here
	for {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			handleSOCKSConn(c, dial)
		}()
	}
}

// handleSOCKSConn performs the SOCKS5 no-auth handshake and CONNECT request
// on c, dials the requested target via dial, and — on success — pipes bytes
// both ways until the connection ends. c is always closed before returning
// (directly on every early-return path, and via pipe's own close-both-ends
// behavior on the success path).
func handleSOCKSConn(c net.Conn, dial func(addr string) (net.Conn, error)) {
	defer func() { _ = c.Close() }()

	// Greeting: VER(1) NMETHODS(1) METHODS(NMETHODS).
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(c, hdr); err != nil {
		return
	}
	if hdr[0] != socks5Ver {
		return // not SOCKS5 — nothing sane to reply with, just close
	}
	methods := make([]byte, hdr[1])
	if _, err := io.ReadFull(c, methods); err != nil {
		return
	}
	hasNoAuth := false
	for _, m := range methods {
		if m == socks5MethodNoAuth {
			hasNoAuth = true
			break
		}
	}
	if !hasNoAuth {
		_, _ = c.Write([]byte{socks5Ver, socks5MethodNoAcpt})
		return
	}
	if _, err := c.Write([]byte{socks5Ver, socks5MethodNoAuth}); err != nil {
		return
	}

	// Request: VER(1) CMD(1) RSV(1) ATYP(1) DST.ADDR(var) DST.PORT(2).
	reqHdr := make([]byte, 4)
	if _, err := io.ReadFull(c, reqHdr); err != nil {
		return
	}
	if reqHdr[0] != socks5Ver {
		return
	}
	if reqHdr[1] != socks5CmdConnect {
		_ = writeSOCKSReply(c, socks5RepCmdNotSupp)
		return
	}

	host, ok := readSOCKSAddr(c, reqHdr[3])
	if !ok {
		_ = writeSOCKSReply(c, socks5RepAtypNotSup)
		return
	}
	portBuf := make([]byte, 2)
	if _, err := io.ReadFull(c, portBuf); err != nil {
		return
	}
	addr := net.JoinHostPort(host, strconv.Itoa(int(binary.BigEndian.Uint16(portBuf))))

	upstream, err := dial(addr)
	if err != nil {
		_ = writeSOCKSReply(c, socks5RepConnRefuse)
		return
	}

	if err := writeSOCKSReply(c, socks5RepSucceeded); err != nil {
		_ = upstream.Close()
		return
	}

	pipe(c, upstream) // reuses manager.go's pipe; closes both ends when either side finishes
}

// readSOCKSAddr reads DST.ADDR for the given ATYP from c and returns it as a
// host string (dotted IPv4, bracketless IPv6, or the raw domain name). ok is
// false for an unsupported ATYP or a read failure.
func readSOCKSAddr(c net.Conn, atyp byte) (host string, ok bool) {
	switch atyp {
	case socks5AtypIPv4:
		b := make([]byte, net.IPv4len)
		if _, err := io.ReadFull(c, b); err != nil {
			return "", false
		}
		return net.IP(b).String(), true
	case socks5AtypIPv6:
		b := make([]byte, net.IPv6len)
		if _, err := io.ReadFull(c, b); err != nil {
			return "", false
		}
		return net.IP(b).String(), true
	case socks5AtypDomain:
		lenBuf := make([]byte, 1)
		if _, err := io.ReadFull(c, lenBuf); err != nil {
			return "", false
		}
		name := make([]byte, lenBuf[0])
		if _, err := io.ReadFull(c, name); err != nil {
			return "", false
		}
		return string(name), true
	default:
		return "", false
	}
}

// writeSOCKSReply sends a 10-byte SOCKS5 reply (VER REP RSV ATYP BND.ADDR
// BND.PORT) with the given REP code and a zero-valued IPv4 bind
// address/port — the same "don't care" placeholder minimal SOCKS5 servers
// use for both success and failure replies, since this server never
// actually binds a distinct address for the CONNECT.
func writeSOCKSReply(c net.Conn, rep byte) error {
	reply := []byte{socks5Ver, rep, 0x00, socks5AtypIPv4, 0, 0, 0, 0, 0, 0}
	_, err := c.Write(reply)
	return err
}
