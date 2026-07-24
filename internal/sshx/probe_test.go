package sshx

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"net"
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

// A server that refuses to open a session channel at all (ForceCommand,
// sftp-only account) must degrade to unknown, never fail the connect.
func TestDetectShellUnknownWhenExecRefused(t *testing.T) {
	addr, hostKey := newTestServer(t) // rejects every channel
	if got := DetectShell(dialTo(t, addr, hostKey)); got != ShellUnknown {
		t.Errorf("DetectShell = %q, want unknown", got)
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
