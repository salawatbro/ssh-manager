package sshx

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	"github.com/salawat/sshmgr/internal/domain"
)

// newPubKeyServer accepts only allowed's public key and runs every exec
// request by echoing "<cmd>|<stdin>" back.
func newPubKeyServer(t *testing.T, allowed ssh.PublicKey) (addr string, hostKey ssh.PublicKey) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	host, err := ssh.NewSignerFromSigner(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{PublicKeyCallback: func(_ ssh.ConnMetadata, k ssh.PublicKey) (*ssh.Permissions, error) {
		if bytes.Equal(k.Marshal(), allowed.Marshal()) {
			return &ssh.Permissions{}, nil
		}
		return nil, io.EOF
	}}
	cfg.AddHostKey(host)
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
			go serveExec(c, cfg)
		}
	}()
	return ln.Addr().String(), host.PublicKey()
}

func serveExec(c net.Conn, cfg *ssh.ServerConfig) {
	sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
	if err != nil {
		_ = c.Close()
		return
	}
	defer func() { _ = sc.Close() }()
	go ssh.DiscardRequests(reqs)
	for nc := range chans {
		if nc.ChannelType() != "session" {
			_ = nc.Reject(ssh.UnknownChannelType, "session only")
			continue
		}
		ch, chReqs, err := nc.Accept()
		if err != nil {
			continue
		}
		go func() {
			defer func() { _ = ch.Close() }()
			for req := range chReqs {
				if req.Type != "exec" {
					_ = req.Reply(false, nil)
					continue
				}
				var p struct{ Command string }
				_ = ssh.Unmarshal(req.Payload, &p)
				_ = req.Reply(true, nil)
				in, _ := io.ReadAll(ch)
				_, _ = io.WriteString(ch, p.Command+"|"+string(in))
				_, _ = ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{0}))
				return
			}
		}()
	}
}

func agentSigner(t *testing.T) ssh.Signer {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	ring := agent.NewKeyring()
	if err := ring.Add(agent.AddedKey{PrivateKey: priv}); err != nil {
		t.Fatal(err)
	}
	signers, err := ring.Signers()
	if err != nil || len(signers) != 1 {
		t.Fatalf("Signers = %v, %v", signers, err)
	}
	return signers[0]
}

func TestAuthMethodsZishKey(t *testing.T) {
	srv := domain.Server{AuthType: domain.AuthZishKey}
	if _, err := AuthMethods(srv, Credentials{}); err == nil || !strings.Contains(err.Error(), "Zish key") {
		t.Fatalf("no signer = %v", err)
	}
	assertCode(t, func() error { _, err := AuthMethods(srv, Credentials{}); return err }(), domain.CodeAgentKeyMissing)
	m, err := AuthMethods(srv, Credentials{AgentSigner: agentSigner(t)})
	if err != nil || len(m) != 1 {
		t.Fatalf("AuthMethods = %v, %v", m, err)
	}
}

func TestDialChainWithAgentSignerAndRunInput(t *testing.T) {
	signer := agentSigner(t)
	addr, hostKey := newPubKeyServer(t, signer.PublicKey())
	host, port := splitHostPort(t, addr)
	srv := domain.Server{Host: host, Port: port, User: "deploy", AuthType: domain.AuthZishKey}

	kh := filepath.Join(t.TempDir(), "known_hosts")
	seedKnownHost(t, kh, addr, hostKey)
	v, err := NewVerifier(kh, &stubPrompter{})
	if err != nil {
		t.Fatal(err)
	}
	d := NewDialer(v, 5*time.Second, 5*time.Second)

	if _, err := d.DialChain(context.Background(), []Hop{{Server: srv, Creds: Credentials{AgentSigner: agentSigner(t)}}}); err == nil {
		t.Fatal("authenticated with the wrong key")
	}
	conn, err := d.DialChain(context.Background(), []Hop{{Server: srv, Creds: Credentials{AgentSigner: signer}}})
	if err != nil {
		t.Fatalf("DialChain: %v", err)
	}
	defer func() { _ = conn.Close() }()

	out, err := RunInput(conn.Client, "install", []byte("ssh-ed25519 AAAA me\n"), 5*time.Second)
	if err != nil || out != "install|ssh-ed25519 AAAA me\n" {
		t.Fatalf("RunInput = %q, %v", out, err)
	}
}

func TestVerifierMatchesWithoutPrompting(t *testing.T) {
	kh := filepath.Join(t.TempDir(), "known_hosts")
	p := &stubPrompter{accept: true}
	v, err := NewVerifier(kh, p)
	if err != nil {
		t.Fatal(err)
	}
	key := agentSigner(t).PublicKey()
	if v.Matches("db.example:22", key) {
		t.Fatal("matched an unknown host")
	}
	// The external ssh appends to known_hosts while Zish runs.
	time.Sleep(10 * time.Millisecond)
	seedKnownHost(t, kh, "db.example:22", key)
	if !v.Matches("db.example:22", key) {
		t.Fatal("did not see a host added after startup")
	}
	if v.Matches("db.example:2222", key) || v.Matches("db.example:22", agentSigner(t).PublicKey()) {
		t.Fatal("matched the wrong port or key")
	}
	if len(p.seen) != 0 {
		t.Fatalf("Matches prompted: %+v", p.seen)
	}
}

func TestVerifierKnownReadsWithoutWriting(t *testing.T) {
	kh := filepath.Join(t.TempDir(), "known_hosts")
	p := &stubPrompter{accept: true}
	v, err := NewVerifier(kh, p)
	if err != nil {
		t.Fatal(err)
	}
	if v.Known("db.example:22") {
		t.Fatal("an empty known_hosts knows db.example")
	}
	time.Sleep(10 * time.Millisecond)
	seedKnownHost(t, kh, "db.example:22", agentSigner(t).PublicKey())
	seedKnownHost(t, kh, "[jump.example]:2222", agentSigner(t).PublicKey())
	before, err := os.ReadFile(kh)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		hostport string
		want     bool
	}{
		{"db.example:22", true},
		{"db.example:2222", false},
		{"jump.example:2222", true},
		{"jump.example:22", false},
		{"other.example:22", false},
	}
	for _, tt := range tests {
		if got := v.Known(tt.hostport); got != tt.want {
			t.Errorf("Known(%q) = %v, want %v", tt.hostport, got, tt.want)
		}
	}
	after, _ := os.ReadFile(kh)
	if string(after) != string(before) || len(p.seen) != 0 {
		t.Fatal("Known wrote known_hosts or prompted")
	}
}

func TestVerifierKnownMissingFile(t *testing.T) {
	kh := filepath.Join(t.TempDir(), "known_hosts")
	v, err := NewVerifier(kh, &stubPrompter{})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(kh); err != nil {
		t.Fatal(err)
	}
	if v.Known("db.example:22") {
		t.Fatal("a missing file knows a host")
	}
}
