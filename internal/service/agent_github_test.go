package service

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// startGreeter is a GitHub-like sshd: a known key gets greeting on stderr
// and exit status 1 for its shell request, like "ssh -T git@github.com".
func startGreeter(t *testing.T, greeting string, known func() ssh.PublicKey) (string, ssh.PublicKey) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	hs, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{PublicKeyCallback: func(_ ssh.ConnMetadata, k ssh.PublicKey) (*ssh.Permissions, error) {
		if want := known(); want != nil && bytes.Equal(want.Marshal(), k.Marshal()) {
			return nil, nil
		}
		return nil, errors.New("unknown key")
	}}
	cfg.AddHostKey(hs)
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
			go serveGreeting(c, cfg, greeting)
		}
	}()
	return ln.Addr().String(), hs.PublicKey()
}

func serveGreeting(c net.Conn, cfg *ssh.ServerConfig, greeting string) {
	_, chans, reqs, err := ssh.NewServerConn(c, cfg)
	if err != nil {
		_ = c.Close()
		return
	}
	go ssh.DiscardRequests(reqs)
	for nc := range chans {
		ch, in, err := nc.Accept()
		if err != nil {
			continue
		}
		go func() {
			defer func() { _ = ch.Close() }()
			for req := range in {
				if req.Type != "shell" {
					_ = req.Reply(false, nil)
					continue
				}
				_ = req.Reply(true, nil)
				_, _ = io.WriteString(ch.Stderr(), greeting)
				_, _ = ch.SendRequest("exit-status", false, ssh.Marshal(struct{ C uint32 }{1}))
				return
			}
		}()
	}
}

// greeterDialer dials the greeter for any host and keeps the servers asked for.
type greeterDialer struct {
	*fakeDialer
	addr    string
	hostKey ssh.PublicKey
	asked   []domain.Server
}

func (d *greeterDialer) DialChain(_ context.Context, chain []sshx.Hop) (*sshx.Conn, error) {
	last := chain[len(chain)-1]
	d.asked = append(d.asked, last.Server)
	c, err := ssh.Dial("tcp", d.addr, &ssh.ClientConfig{
		User:            last.Server.User,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(last.Creds.AgentSigner)},
		HostKeyCallback: ssh.FixedHostKey(d.hostKey),
		Timeout:         5 * time.Second,
	})
	if err != nil {
		return nil, domain.NewError(domain.CodeAuthFailed, "Authentication failed.")
	}
	return &sshx.Conn{Client: c}, nil
}

func newGitHubFixture(t *testing.T, greeting string, register bool) (*agentFixture, *greeterDialer, string) {
	t.Helper()
	f := newAgentFixture(t)
	k, err := f.svc.Generate(GenerateKeyInput{Name: "laptop", Type: agent.KindEd25519})
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _, _, err := ssh.ParseAuthorizedKey([]byte(k.PublicKey))
	if err != nil {
		t.Fatal(err)
	}
	addr, hostKey := startGreeter(t, greeting, func() ssh.PublicKey {
		if register {
			return pub
		}
		return nil
	})
	d := &greeterDialer{fakeDialer: &fakeDialer{}, addr: addr, hostKey: hostKey}
	f.svc.rt.mu.Lock()
	f.svc.rt.deps.Dialer = d
	f.svc.rt.mu.Unlock()
	return f, d, k.ID
}

func TestTestGitHubReportsTheAccount(t *testing.T) {
	f, d, id := newGitHubFixture(t, "Hi octocat! You've successfully authenticated, but GitHub does not provide shell access.\n", true)
	got, err := f.svc.TestGitHub(id)
	if err != nil || got.Login != "octocat" {
		t.Fatalf("TestGitHub = %+v, %v", got, err)
	}
	if s := d.asked[0]; s.Host != "github.com" || s.Port != 22 || s.User != "git" {
		t.Fatalf("dialed %+v", s)
	}
	if ev, _ := f.log.List(1); len(ev) != 1 || ev[0].KeyID != id || ev[0].ClientChain != "test GitHub" || ev[0].Destination != "GitHub" {
		t.Fatalf("sign log = %+v", ev)
	}
}

func TestTestGitHubNamesADeployKeyRepo(t *testing.T) {
	f, _, id := newGitHubFixture(t, "Hi salawat/zish! You've successfully authenticated, but GitHub does not provide shell access.\n", true)
	if got, err := f.svc.TestGitHub(id); err != nil || got.Login != "salawat/zish" {
		t.Fatalf("TestGitHub = %+v, %v", got, err)
	}
}

func TestTestGitHubUnknownKey(t *testing.T) {
	f, _, id := newGitHubFixture(t, "Hi octocat!\n", false)
	_, err := f.svc.TestGitHub(id)
	if errCode(err) != domain.CodeAuthFailed || !strings.Contains(err.Error(), "authentication key") {
		t.Fatalf("err = %v", err)
	}
}

func TestTestGitHubWithoutGreeting(t *testing.T) {
	f, _, id := newGitHubFixture(t, "Welcome to some other server\n", true)
	_, err := f.svc.TestGitHub(id)
	if errCode(err) != domain.CodeInternal || !strings.Contains(err.Error(), "Welcome to some other server") {
		t.Fatalf("err = %v", err)
	}
}

func TestGitHubSetupSnippets(t *testing.T) {
	f := newAgentFixture(t)
	k, err := f.svc.Generate(GenerateKeyInput{Name: "laptop", Type: agent.KindEd25519})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(f.pubDir); err != nil {
		t.Fatal(err)
	}
	got, err := f.svc.GitHubSetup(k.ID)
	if err != nil {
		t.Fatal(err)
	}
	pubFile := filepath.Join(f.pubDir, k.ID+".pub")
	for _, want := range []string{
		"Host github.com\n    User git\n",
		"    IdentityAgent \"~/Library/Application Support/SSHManager/run/agent.sock\"\n",
		"    IdentityFile \"" + pubFile + "\"\n",
		"    IdentitiesOnly yes\n",
	} {
		if !strings.Contains(got.SSHConfig, want) {
			t.Fatalf("ssh config lacks %q:\n%s", want, got.SSHConfig)
		}
	}
	if _, err := os.Stat(pubFile); err != nil {
		t.Fatalf("pub file: %v", err)
	}
	if !strings.Contains(got.ShellExport, `export SSH_AUTH_SOCK="$HOME/Library/Application Support/SSHManager/run/agent.sock"`) {
		t.Fatalf("shell export =\n%s", got.ShellExport)
	}
	for _, want := range []string{
		"git config --global gpg.format ssh\n",
		"git config --global user.signingkey 'key::" + k.PublicKey + "'\n",
		"git config --global commit.gpgsign true\n",
	} {
		if !strings.Contains(got.GitSigning, want) {
			t.Fatalf("git signing lacks %q:\n%s", want, got.GitSigning)
		}
	}
}

func TestGitHubSetupNeedsTheSocket(t *testing.T) {
	f := newAgentFixture(t)
	k, _ := f.svc.Generate(GenerateKeyInput{Name: "laptop", Type: agent.KindEd25519})
	d := f.svc.deps()
	d.SocketPath = ""
	SetAgentDeps(f.svc, d)
	if _, err := f.svc.GitHubSetup(k.ID); errCode(err) != domain.CodeAgentUnavail {
		t.Fatalf("err = %v", err)
	}
}

func TestSigningKeyLiteralRefusesOddKeys(t *testing.T) {
	for _, pub := range []string{"", "ssh-ed25519", "ssh-ed25519 AAAA'x", "ssh'ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA"} {
		if _, err := signingKeyLiteral(pub); err == nil {
			t.Fatalf("%q was accepted", pub)
		}
	}
}
