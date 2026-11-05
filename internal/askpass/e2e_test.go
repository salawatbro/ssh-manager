//go:build darwin

package askpass

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/salawat/sshmgr/internal/domain"
)

// startSSHServer serves one account that needs a password and then a TOTP
// code over keyboard-interactive, and answers any exec with "ok".
func startSSHServer(t *testing.T, password string) (addr string, hostKey ssh.PublicKey, sent *passwordLog) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	sent = &passwordLog{}
	cfg := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, pw []byte) (*ssh.Permissions, error) {
			sent.add(string(pw))
			if c.User() != "root" || string(pw) != password {
				return nil, errors.New("denied")
			}
			return nil, &ssh.PartialSuccessError{Next: ssh.ServerAuthCallbacks{
				KeyboardInteractiveCallback: func(_ ssh.ConnMetadata, ch ssh.KeyboardInteractiveChallenge) (*ssh.Permissions, error) {
					ans, err := ch("", "", []string{"Verification code: "}, []bool{false})
					if err != nil || len(ans) != 1 {
						return nil, errors.New("no code")
					}
					want, _ := domain.TOTPCode(seed, time.Now())
					if ans[0] != want {
						return nil, errors.New("bad code")
					}
					return nil, nil
				},
			}}
		},
	}
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
			go serveSSH(c, cfg)
		}
	}()
	return ln.Addr().String(), signer.PublicKey(), sent
}

type passwordLog struct {
	mu  sync.Mutex
	pws []string
}

func (l *passwordLog) add(pw string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pws = append(l.pws, pw)
}

func (l *passwordLog) count(pw string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	n := 0
	for _, p := range l.pws {
		if p == pw {
			n++
		}
	}
	return n
}

func serveSSH(c net.Conn, cfg *ssh.ServerConfig) {
	defer func() { _ = c.Close() }()
	_, chans, reqs, err := ssh.NewServerConn(c, cfg)
	if err != nil {
		return
	}
	go ssh.DiscardRequests(reqs)
	for nc := range chans {
		if nc.ChannelType() != "session" {
			_ = nc.Reject(ssh.UnknownChannelType, "")
			continue
		}
		ch, in, err := nc.Accept()
		if err != nil {
			return
		}
		for req := range in {
			if req.Type != "exec" {
				_ = req.Reply(false, nil)
				continue
			}
			_ = req.Reply(true, nil)
			_, _ = ch.Write([]byte("ok\n"))
			_, _ = ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{0}))
			_ = ch.Close()
		}
	}
}

// Real /usr/bin/ssh, real helper binary: the password and the 2FA code are
// filled in from the broker with no terminal at all, and a wrong stored
// password is sent exactly once.
func TestEndToEndWithRealOpenSSH(t *testing.T) {
	if testing.Short() {
		t.Skip("builds a helper binary")
	}
	if _, err := os.Stat("/usr/bin/ssh"); err != nil {
		t.Skip("no /usr/bin/ssh")
	}
	dir := socketDir(t)
	helper := filepath.Join(dir, "zishhelper")
	if out, err := exec.Command("go", "build", "-o", helper, "./testdata/zishhelper").CombinedOutput(); err != nil { //nolint:gosec // test builds its own helper
		t.Fatalf("build helper: %v\n%s", err, out)
	}
	link := filepath.Join(dir, LinkName)
	if err := os.Symlink(helper, link); err != nil {
		t.Fatal(err)
	}
	addr, hostKey, sent := startSSHServer(t, "s3cr3t")
	host, port, _ := net.SplitHostPort(addr)
	knownHosts := filepath.Join(dir, "known_hosts")
	if err := os.WriteFile(knownHosts, []byte(knownhosts.Line([]string{addr}, hostKey)+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	for i, c := range []struct {
		stored string
		ok     bool
	}{{"s3cr3t", true}, {"wrong-pw", false}} {
		sock := filepath.Join(dir, "c"+strconv.Itoa(i)+".sock")
		b := NewBroker(BrokerConfig{
			Secrets:     &fakeSecrets{pw: map[string]string{"srv": c.stored}, totp: map[string]string{"srv": seed}},
			AskpassPath: link,
			SocketPath:  sock,
		})
		srv := NewServer(b)
		if err := srv.Start(sock); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(srv.Stop)
		tok, err := b.Issue(Launch{
			Argv: []string{"/usr/bin/ssh", "-F", "/dev/null", "-o", "UserKnownHostsFile=" + knownHosts,
				"-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "ConnectTimeout=5",
				"-p", port, "-l", "root", "--", host, "true"},
			Hops:     []Hop{{ServerID: "srv", User: "root", Host: host, Password: true, TOTP: true}},
			Title:    "e2e",
			AutoFill: true,
		})
		if err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command(helper, "--connect", tok) //nolint:gosec // test-built helper
		cmd.Env = append(os.Environ(), EnvControlSocket+"="+sock, "SSH_ASKPASS=/tmp/evil", "ZISH_ASKPASS_TOKEN=stale")
		timer := time.AfterFunc(30*time.Second, func() { _ = cmd.Process.Kill() })
		out, err := cmd.CombinedOutput()
		timer.Stop()
		if c.ok {
			if err != nil || !strings.HasPrefix(string(out), "\x1b]0;e2e\x07") || !strings.Contains(string(out), "ok") {
				t.Fatalf("ssh: %v\n%q", err, out)
			}
		} else if err == nil {
			t.Fatalf("wrong password logged in: %q", out)
		}
		if n := sent.count(c.stored); n != 1 {
			t.Fatalf("stored password %q sent %d times", c.stored, n)
		}
	}
}
