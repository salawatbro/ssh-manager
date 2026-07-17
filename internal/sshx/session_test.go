package sshx

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
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
