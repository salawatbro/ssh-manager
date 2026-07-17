package sshx

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"io"
	"net"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// newEchoServer starts an in-process SSH server that accepts a session, grants
// a PTY and a shell, and echoes everything typed straight back — enough to
// prove Write reaches the remote and Read returns its output. It closes on
// test cleanup. NoClientAuth: the client's auth method is irrelevant here.
func newEchoServer(t *testing.T) (addr string, hostKey ssh.PublicKey) {
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
			go serveEcho(c, cfg)
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

func serveEcho(c net.Conn, cfg *ssh.ServerConfig) {
	sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
	if err != nil {
		_ = c.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	go func() {
		for nc := range chans {
			if nc.ChannelType() != "session" {
				_ = nc.Reject(ssh.UnknownChannelType, "only session")
				continue
			}
			ch, chReqs, err := nc.Accept()
			if err != nil {
				continue
			}
			go func() {
				for req := range chReqs {
					switch req.Type {
					case "pty-req", "shell", "window-change":
						_ = req.Reply(true, nil)
					default:
						_ = req.Reply(false, nil)
					}
				}
			}()
			go func() { _, _ = io.Copy(ch, ch); _ = ch.Close() }() // echo
		}
	}()
	_ = sc.Wait()
}

func TestDialReturnsLiveClientAndSessionEchoes(t *testing.T) {
	path := khPath(t) // helper from hostkey_test.go: a temp known_hosts path
	addr, hostKey := newEchoServer(t)
	seedKnownHost(t, path, addr, hostKey) // helper from hostkey_test.go

	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	d := NewDialer(v, 5*time.Second, 20*time.Second)

	host, port := splitHostPort(t, addr) // helper from testserver_test.go
	srv := domain.Server{Host: host, Port: port, User: "u", AuthType: domain.AuthPassword}
	client, err := d.Dial(context.Background(), srv, Credentials{Password: "x"})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	sess, err := OpenSession(&Conn{Client: client}, 80, 24)
	if err != nil {
		t.Fatalf("OpenSession: %v", err)
	}
	defer func() { _ = sess.Close() }()

	if _, err := sess.Write([]byte("hello\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got := readWithin(t, sess, 3*time.Second)
	if !strings.Contains(got, "hello") {
		t.Fatalf("echo not seen, got %q", got)
	}
	if err := sess.Resize(100, 30); err != nil {
		t.Fatalf("Resize: %v", err)
	}
	if err := sess.KeepAlive(); err != nil {
		t.Fatalf("KeepAlive: %v", err)
	}
}

// newExitServer starts an in-process SSH server that grants a PTY and a
// shell like newEchoServer, but never echoes: it immediately closes the
// session channel, optionally sending an SSH "exit-status" request first —
// exactly what a real sshd does when the shell process exits versus when the
// channel is simply torn down (e.g. the transport dies). This drives
// (*ssh.Session).Wait() down the same paths WaitExitClean classifies:
// sendStatus=true yields ssh.Wait()==nil (status 0) or *ssh.ExitError
// (non-zero); sendStatus=false yields *ssh.ExitMissingError.
func newExitServer(t *testing.T, exitCode int, sendStatus bool) (addr string, hostKey ssh.PublicKey) {
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
			go serveExit(c, cfg, exitCode, sendStatus)
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

func serveExit(c net.Conn, cfg *ssh.ServerConfig, exitCode int, sendStatus bool) {
	sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
	if err != nil {
		_ = c.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	go func() {
		for nc := range chans {
			if nc.ChannelType() != "session" {
				_ = nc.Reject(ssh.UnknownChannelType, "only session")
				continue
			}
			ch, chReqs, err := nc.Accept()
			if err != nil {
				continue
			}
			go func() {
				for req := range chReqs {
					switch req.Type {
					case "pty-req", "window-change":
						_ = req.Reply(true, nil)
					case "shell":
						_ = req.Reply(true, nil)
						if sendStatus {
							payload := make([]byte, 4)
							binary.BigEndian.PutUint32(payload, uint32(exitCode))
							_, _ = ch.SendRequest("exit-status", false, payload)
						}
						_ = ch.Close()
					default:
						_ = req.Reply(false, nil)
					}
				}
			}()
		}
	}()
	_ = sc.Wait()
}

// openExitSession dials newExitServer and returns a live Session against it.
func openExitSession(t *testing.T, exitCode int, sendStatus bool) *Session {
	t.Helper()
	path := khPath(t)
	addr, hostKey := newExitServer(t, exitCode, sendStatus)
	seedKnownHost(t, path, addr, hostKey)

	v, err := NewVerifier(path, &stubPrompter{accept: true})
	if err != nil {
		t.Fatal(err)
	}
	d := NewDialer(v, 5*time.Second, 20*time.Second)

	host, port := splitHostPort(t, addr)
	srv := domain.Server{Host: host, Port: port, User: "u", AuthType: domain.AuthPassword}
	client, err := d.Dial(context.Background(), srv, Credentials{Password: "x"})
	if err != nil {
		t.Fatalf("Dial: %v", err)
	}
	sess, err := OpenSession(&Conn{Client: client}, 80, 24)
	if err != nil {
		t.Fatalf("OpenSession: %v", err)
	}
	return sess
}

// drainToEOF reads sess until it hits EOF (or the deadline), mirroring what
// the manager's readLoop does before WaitExitClean is ever called — the
// contract documented on WaitExitClean.
func drainToEOF(t *testing.T, sess *Session, d time.Duration) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			if _, err := sess.Read(buf); err != nil {
				return
			}
		}
	}()
	select {
	case <-done:
	case <-time.After(d):
		t.Fatal("timed out waiting for EOF")
	}
}

// A shell that exits status 0 is a clean exit.
func TestWaitExitCleanTrueOnZeroExitStatus(t *testing.T) {
	sess := openExitSession(t, 0, true)
	defer func() { _ = sess.Close() }()
	drainToEOF(t, sess, 3*time.Second)
	if !sess.WaitExitClean() {
		t.Fatal("exit status 0 should be reported as a clean exit")
	}
}

// A shell that exits non-zero (e.g. `exit 7`) is still a clean process exit —
// the user's shell simply ended with a non-zero status, not a drop.
func TestWaitExitCleanTrueOnNonZeroExitStatus(t *testing.T) {
	sess := openExitSession(t, 7, true)
	defer func() { _ = sess.Close() }()
	drainToEOF(t, sess, 3*time.Second)
	if !sess.WaitExitClean() {
		t.Fatal("a non-zero exit status should still be reported as a clean exit")
	}
}

// A channel that closes without an exit-status (transport gone, dead peer)
// is NOT a clean exit — Wait() surfaces *ssh.ExitMissingError and
// WaitExitClean must report false so the frontend still offers Reconnect.
func TestWaitExitCleanFalseWithoutExitStatus(t *testing.T) {
	sess := openExitSession(t, 0, false)
	defer func() { _ = sess.Close() }()
	drainToEOF(t, sess, 3*time.Second)
	if sess.WaitExitClean() {
		t.Fatal("a channel close without exit-status should not be reported as a clean exit")
	}
}

// readWithin reads once (up to 4 KiB) with a deadline, so the test fails fast
// instead of hanging if the echo never comes.
func readWithin(t *testing.T, sess *Session, d time.Duration) string {
	t.Helper()
	type res struct {
		s   string
		err error
	}
	ch := make(chan res, 1)
	go func() {
		b := make([]byte, 4096)
		n, err := sess.Read(b)
		ch <- res{string(b[:n]), err}
	}()
	select {
	case r := <-ch:
		if r.err != nil && r.s == "" {
			t.Fatalf("Read: %v", r.err)
		}
		return r.s
	case <-time.After(d):
		t.Fatal("timed out waiting for echo")
		return ""
	}
}
