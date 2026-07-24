package sshx

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"net"
	"runtime"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// newExecServer starts an in-process SSH server that answers every "exec"
// request by writing out to the channel and exiting 0. It closes on cleanup.
func newExecServer(t *testing.T, out string) (addr string, hostKey ssh.PublicKey) {
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
			go serveExec(c, cfg, out)
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

func serveExec(c net.Conn, cfg *ssh.ServerConfig, out string) {
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
					if req.Type != "exec" {
						_ = req.Reply(false, nil)
						continue
					}
					_ = req.Reply(true, nil)
					_, _ = ch.Write([]byte(out))
					status := make([]byte, 4)
					binary.BigEndian.PutUint32(status, 0)
					_, _ = ch.SendRequest("exit-status", false, status)
					_ = ch.Close()
				}
			}()
		}
	}()
	_ = sc.Wait()
}

// newHangServer starts an in-process SSH server that accepts the session
// channel — unlike newTestServer, which rejects the channel open itself —
// but then never replies to any request on it, including "exec". That leaves
// a client's sess.Output call blocked exactly like a busy or wedged real
// host, exercising DetectShell's timeout path. It closes on test cleanup.
func newHangServer(t *testing.T) (addr string, hostKey ssh.PublicKey) {
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
			go serveHang(c, cfg)
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

func serveHang(c net.Conn, cfg *ssh.ServerConfig) {
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
			_, chReqs, err := nc.Accept()
			if err != nil {
				continue
			}
			// Drain requests without ever replying — the client's "exec"
			// request (wantReply: true) hangs forever, or until the
			// connection is torn down.
			go func() {
				for req := range chReqs {
					_ = req // never replied to, by design
				}
			}()
		}
	}()
	_ = sc.Wait()
}

// dialTo is the shared "get a live *Conn against addr" setup for these tests.
func dialTo(t *testing.T, addr string, hostKey ssh.PublicKey) *Conn {
	t.Helper()
	path := khPath(t)
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
	t.Cleanup(func() { _ = client.Close() })
	return &Conn{Client: client}
}

func TestDetectShellReadsTheLoginShell(t *testing.T) {
	cases := []struct {
		out  string
		want Shell
	}{
		{"/bin/bash\n", ShellBash},
		{"/bin/zsh\n", ShellZsh},
		{"/usr/local/bin/fish\r\n", ShellFish},
		{"/bin/csh\n", ShellUnknown},
		{"\n", ShellUnknown},
	}
	for _, c := range cases {
		addr, hostKey := newExecServer(t, c.out)
		if got := DetectShell(dialTo(t, addr, hostKey)); got != c.want {
			t.Errorf("DetectShell(%q) = %q, want %q", c.out, got, c.want)
		}
	}
}

// A server that rejects the session-channel open itself — an earlier failure
// point than a real ForceCommand/sftp-only account, which would open the
// channel and only then refuse or ignore the exec request — must still
// degrade to unknown, never fail the connect. See
// TestDetectShellUnknownOnTimeout for the "channel opens, command never
// answers" case.
func TestDetectShellUnknownWhenChannelRejected(t *testing.T) {
	addr, hostKey := newTestServer(t) // rejects every channel
	if got := DetectShell(dialTo(t, addr, hostKey)); got != ShellUnknown {
		t.Errorf("DetectShell = %q, want unknown", got)
	}
}

// The single property DetectShell exists to guarantee: against a host that
// accepts the exec channel and then never answers, it returns ShellUnknown
// promptly instead of hanging. The timeout is shortened for the duration of
// this test so it runs fast.
func TestDetectShellUnknownOnTimeout(t *testing.T) {
	const testTimeout = 100 * time.Millisecond

	addr, hostKey := newHangServer(t)
	start := time.Now()
	got := detectShell(dialTo(t, addr, hostKey), testTimeout)
	elapsed := time.Since(start)

	if got != ShellUnknown {
		t.Errorf("DetectShell = %q, want unknown", got)
	}
	// Lower bound pins that this return actually came from the timeout
	// firing, not from some error path returning immediately (which would
	// let a regression that silently grows the timeout slip through).
	if elapsed < testTimeout {
		t.Errorf("DetectShell took %v, want at least %v", elapsed, testTimeout)
	}
	// Generous upper bound so this isn't flaky under CI load, but tight
	// enough that it fails if the timeout/select were removed (in which case
	// DetectShell would block until the test's deferred client.Close, or
	// hang the whole test run).
	if elapsed > time.Second {
		t.Errorf("DetectShell took %v, want roughly %v", elapsed, testTimeout)
	}
}

// TestDetectShellDoesNotLeakGoroutineOnTimeout proves the reviewer's fix: on
// timeout, DetectShell closes the session so the probe goroutine's blocked
// s.Output call unblocks and the goroutine actually exits, instead of leaking
// for the rest of the connection's life. Neutering the "_ = sess.Close()" call
// in the timeout branch makes this test fail (no goroutine is ever reaped),
// which is what proves this test covers the fix rather than just the
// return value asserted by TestDetectShellUnknownOnTimeout.
func TestDetectShellDoesNotLeakGoroutineOnTimeout(t *testing.T) {
	const testTimeout = 100 * time.Millisecond

	addr, hostKey := newHangServer(t)
	got := detectShell(dialTo(t, addr, hostKey), testTimeout)
	if got != ShellUnknown {
		t.Errorf("DetectShell = %q, want unknown", got)
	}

	const (
		pollInterval = 20 * time.Millisecond
		maxWait      = 2 * time.Second
	)
	deadline := time.Now().Add(maxWait)
	for {
		n := countGoroutinesOnStack(t, "sshx.detectShell")
		if n == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%d goroutine(s) still have sshx.detectShell on their stack after %v", n, maxWait)
		}
		time.Sleep(pollInterval)
	}
}

// countGoroutinesOnStack snapshots every goroutine's stack via runtime.Stack
// and counts how many mention marker, e.g. "sshx.detectShell".
func countGoroutinesOnStack(t *testing.T, marker string) int {
	t.Helper()
	buf := make([]byte, 1<<20)
	for {
		n := runtime.Stack(buf, true)
		if n < len(buf) {
			buf = buf[:n]
			break
		}
		buf = make([]byte, 2*len(buf))
	}
	count := 0
	for _, stack := range strings.Split(string(buf), "\n\n") {
		if strings.Contains(stack, marker) {
			count++
		}
	}
	return count
}

func TestDetectShellNilConn(t *testing.T) {
	if got := DetectShell(nil); got != ShellUnknown {
		t.Errorf("DetectShell(nil) = %q, want unknown", got)
	}
	if got := DetectShell(&Conn{}); got != ShellUnknown {
		t.Errorf("DetectShell(&Conn{}) = %q, want unknown", got)
	}
}

func TestClassifyShell(t *testing.T) {
	cases := map[string]Shell{
		"/bin/bash":              ShellBash,
		"  /bin/zsh \r\n":        ShellZsh,
		"-bash":                  ShellBash,
		"/opt/homebrew/bin/fish": ShellFish,
		"/bin/sh":                ShellUnknown,
		"":                       ShellUnknown,
		"   ":                    ShellUnknown,
	}
	for in, want := range cases {
		if got := classifyShell(in); got != want {
			t.Errorf("classifyShell(%q) = %q, want %q", in, got, want)
		}
	}
}
