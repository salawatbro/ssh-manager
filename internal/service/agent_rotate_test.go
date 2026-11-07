package service

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// keyServer is an in-process sshd: it lets a key in when the key is in
// home's authorized_keys (read on every sign-in) and runs exec requests with
// /bin/sh in that home.
type keyServer struct {
	addr    string
	hostKey ssh.PublicKey
	home    string
	refuse  func(ssh.PublicKey) bool
}

func startKeyServer(t *testing.T) *keyServer {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	hs, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	ks := &keyServer{hostKey: hs.PublicKey(), home: t.TempDir()}
	_ = os.MkdirAll(filepath.Join(ks.home, ".ssh"), 0o700)
	cfg := &ssh.ServerConfig{PublicKeyCallback: func(_ ssh.ConnMetadata, k ssh.PublicKey) (*ssh.Permissions, error) {
		if (ks.refuse == nil || !ks.refuse(k)) && ks.authorized(k) {
			return nil, nil
		}
		return nil, errors.New("not authorized")
	}}
	cfg.AddHostKey(hs)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	ks.addr = ln.Addr().String()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go ks.serve(c, cfg)
		}
	}()
	return ks
}

func (ks *keyServer) authorizedKeys() string {
	b, _ := os.ReadFile(filepath.Join(ks.home, ".ssh", "authorized_keys"))
	return string(b)
}

func (ks *keyServer) authorized(k ssh.PublicKey) bool {
	b := []byte(ks.authorizedKeys())
	for len(b) > 0 {
		pub, _, _, rest, err := ssh.ParseAuthorizedKey(b)
		if err != nil {
			return false
		}
		if bytes.Equal(pub.Marshal(), k.Marshal()) {
			return true
		}
		b = rest
	}
	return false
}

func (ks *keyServer) serve(c net.Conn, cfg *ssh.ServerConfig) {
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
				if req.Type != "exec" {
					_ = req.Reply(false, nil)
					continue
				}
				var p struct{ Cmd string }
				_ = ssh.Unmarshal(req.Payload, &p)
				_ = req.Reply(true, nil)
				cmd := exec.Command("/bin/sh", "-c", p.Cmd) //nolint:gosec // the constant commands under test
				cmd.Env = []string{"HOME=" + ks.home, "PATH=/usr/bin:/bin"}
				cmd.Stdin, cmd.Stdout, cmd.Stderr = ch, ch, ch.Stderr()
				code := 0
				var ee *exec.ExitError
				if err := cmd.Run(); errors.As(err, &ee) {
					code = ee.ExitCode()
				} else if err != nil {
					code = 1
				}
				_, _ = ch.SendRequest("exit-status", false, ssh.Marshal(struct{ C uint32 }{uint32(code)})) //nolint:gosec // an exit code
				return
			}
		}()
	}
}

// keyServerDialer signs in to the keyServer with the last hop's Zish key.
type keyServerDialer struct {
	*fakeDialer
	ks *keyServer
}

func (d *keyServerDialer) DialChain(_ context.Context, chain []sshx.Hop) (*sshx.Conn, error) {
	last := chain[len(chain)-1]
	if last.Creds.AgentSigner == nil {
		return nil, domain.NewError(domain.CodeAuthFailed, "no key")
	}
	c, err := ssh.Dial("tcp", d.ks.addr, &ssh.ClientConfig{
		User:            last.Server.User,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(last.Creds.AgentSigner)},
		HostKeyCallback: ssh.FixedHostKey(d.ks.hostKey),
		Timeout:         5 * time.Second,
	})
	if err != nil {
		return nil, domain.NewError(domain.CodeAuthFailed, "The server didn't accept the key: "+err.Error())
	}
	return &sshx.Conn{Client: c}, nil
}

type rotateFixture struct {
	*agentFixture
	ks       *keyServer
	old, new string
}

func newRotateFixture(t *testing.T) *rotateFixture {
	t.Helper()
	af := newAgentFixture(t)
	ks := startKeyServer(t)
	af.svc.rt.mu.Lock()
	af.svc.rt.deps.Dialer = &keyServerDialer{fakeDialer: &fakeDialer{}, ks: ks}
	af.svc.rt.mu.Unlock()
	oldKey, err := af.svc.Generate(GenerateKeyInput{Name: "old", Type: agent.KindEd25519})
	if err != nil {
		t.Fatal(err)
	}
	newKey, err := af.svc.Generate(GenerateKeyInput{Name: "new", Type: agent.KindEd25519})
	if err != nil {
		t.Fatal(err)
	}
	oldID := oldKey.ID
	srv := domain.Server{ID: "s1", Name: "db", Host: "db.internal", Port: 22, User: "u", AuthType: domain.AuthZishKey, AgentKeyID: &oldID, Environment: domain.EnvNone}
	if err := af.servers.Create(&srv); err != nil {
		t.Fatal(err)
	}
	line, _ := af.svc.PublicKeyLine(oldKey.ID)
	other := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOtherKeyThatStaysOnTheServerXXXXXXXXXXXXXX someone@laptop"
	keys := other + "\n" + `from="10.0.0.0/8" ` + line + "\n"
	if err := os.WriteFile(filepath.Join(ks.home, ".ssh", "authorized_keys"), []byte(keys), 0o600); err != nil {
		t.Fatal(err)
	}
	return &rotateFixture{agentFixture: af, ks: ks, old: oldKey.ID, new: newKey.ID}
}

func TestRotateKeyOnServerSwapsTheKeys(t *testing.T) {
	f := newRotateFixture(t)
	res, err := f.svc.RotateKeyOnServer(f.old, f.new, "s1")
	if err != nil {
		t.Fatal(err)
	}
	if !res.OldKeyRemoved {
		t.Fatalf("result = %+v", res)
	}
	got, _ := f.servers.Get("s1")
	if got.AgentKeyID == nil || *got.AgentKeyID != f.new {
		t.Fatalf("server key = %v, want the new key", got.AgentKeyID)
	}
	oldKey, _ := f.keys.Get(f.old)
	newLine, _ := f.svc.PublicKeyLine(f.new)
	ak := f.ks.authorizedKeys()
	oldBlob, _ := keyBlob(oldKey.PublicKey)
	if strings.Contains(ak, oldBlob) || !strings.Contains(ak, newLine) || !strings.Contains(ak, "someone@laptop") {
		t.Fatalf("authorized_keys =\n%s", ak)
	}
}

func TestRotateKeyOnServerKeepsTheOldKeyWhenTheNewOneFails(t *testing.T) {
	f := newRotateFixture(t)
	newKey, _ := f.keys.Get(f.new)
	f.ks.refuse = func(k ssh.PublicKey) bool {
		return strings.Contains(newKey.PublicKey, strings.Fields(string(ssh.MarshalAuthorizedKey(k)))[1])
	}
	if _, err := f.svc.RotateKeyOnServer(f.old, f.new, "s1"); errCode(err) != domain.CodeAuthFailed {
		t.Fatalf("RotateKeyOnServer = %v, want the sign-in failure", err)
	}
	got, _ := f.servers.Get("s1")
	if *got.AgentKeyID != f.old {
		t.Fatal("the server moved to a key that cannot sign in")
	}
	oldKey, _ := f.keys.Get(f.old)
	oldBlob, _ := keyBlob(oldKey.PublicKey)
	if !strings.Contains(f.ks.authorizedKeys(), oldBlob) {
		t.Fatal("the old key was removed although the new one failed")
	}
}

func TestRotateKeyOnServerRefusesAServerOnAnotherKey(t *testing.T) {
	f := newRotateFixture(t)
	if _, err := f.svc.RotateKeyOnServer(f.new, f.old, "s1"); errCode(err) != domain.CodeValidation {
		t.Fatalf("RotateKeyOnServer = %v", err)
	}
	if _, err := f.svc.RotateKeyOnServer(f.old, f.old, "s1"); errCode(err) != domain.CodeValidation {
		t.Fatalf("same key: %v", err)
	}
}

func TestRemoveKeyCommand(t *testing.T) {
	inner := strings.TrimSuffix(strings.TrimPrefix(removeKeyCommand, "sh -c '"), "'")
	if strings.Contains(inner, "'") {
		t.Fatal("the inner script must not contain a single quote")
	}
	home := t.TempDir()
	ak := filepath.Join(home, ".ssh", "authorized_keys")
	_ = os.MkdirAll(filepath.Dir(ak), 0o700)
	run := func(blob string) {
		t.Helper()
		cmd := exec.Command("/bin/sh", "-c", removeKeyCommand) //nolint:gosec // constant command under test
		cmd.Env = []string{"HOME=" + home, "PATH=/usr/bin:/bin"}
		cmd.Stdin = strings.NewReader(blob + "\n")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("remove: %v %s", err, out)
		}
	}
	run("AAAANOFILEYETXXXXXXXX")
	_ = os.WriteFile(ak, []byte("ssh-ed25519 AAAAKEEPKEEPKEEPKEEP keep\nno-pty ssh-rsa AAAAGONEGONEGONEGONE old@zish\nssh-rsa AAAAGONEGONEGONEGONE\n"), 0o640)
	run("AAAAGONEGONEGONEGONE")
	run("AAAAGONEGONEGONEGONE")
	if got, _ := os.ReadFile(ak); string(got) != "ssh-ed25519 AAAAKEEPKEEPKEEPKEEP keep\n" {
		t.Fatalf("authorized_keys = %q", got)
	}
	if fi, _ := os.Stat(ak); fi.Mode().Perm() != 0o640 {
		t.Fatalf("mode changed to %v", fi.Mode())
	}
}
