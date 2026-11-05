//go:build darwin

package agent

import (
	"bytes"
	"encoding/pem"
	"errors"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/launcher"
)

// testSSHD accepts only allowed public keys and answers every exec request
// with exit status 0. It returns its address and host key.
func testSSHD(t *testing.T, allowed ...ssh.PublicKey) (string, ssh.PublicKey) {
	t.Helper()
	host, err := ssh.NewSignerFromKey(newEd25519(t))
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{PublicKeyCallback: func(_ ssh.ConnMetadata, k ssh.PublicKey) (*ssh.Permissions, error) {
		for _, a := range allowed {
			if bytes.Equal(a.Marshal(), k.Marshal()) {
				return &ssh.Permissions{}, nil
			}
		}
		return nil, errors.New("key not allowed")
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
			go serveSession(c, cfg)
		}
	}()
	return ln.Addr().String(), host.PublicKey()
}

func serveSession(c net.Conn, cfg *ssh.ServerConfig) {
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
				_ = req.Reply(true, nil)
				_, _ = io.WriteString(ch, "authenticated\n")
				_, _ = ch.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{0}))
				return
			}
		}()
	}
}

// A Go ssh client authenticates against a server through the agent socket,
// and Zish's in-process signer does the same without the socket.
func TestEndToEndGoClientThroughAgent(t *testing.T) {
	f := newFixture(t)
	edPub := f.keys.add(t, "k-ed", "work", newEd25519(t), true)
	rsaPub := f.keys.add(t, "k-rsa", "deploy", newRSA(t), false)
	_, path := startListener(t, f)

	for _, allowed := range []ssh.PublicKey{edPub, rsaPub} {
		addr, hostKey := testSSHD(t, allowed)
		conn, err := net.Dial("unix", path)
		if err != nil {
			t.Fatal(err)
		}
		ag := sshagent.NewClient(conn)
		client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
			User: "deploy", Auth: []ssh.AuthMethod{ssh.PublicKeysCallback(ag.Signers)},
			HostKeyCallback: ssh.FixedHostKey(hostKey),
		})
		if err != nil {
			t.Fatalf("%s: dial through the agent: %v", allowed.Type(), err)
		}
		_ = client.Close()
		_ = conn.Close()
	}
	if reqs := f.conf.requests(); len(reqs) == 0 || reqs[0].KeyName != "work" {
		t.Fatalf("confirm-key use did not prompt: %+v", reqs)
	}

	addr, hostKey := testSSHD(t, rsaPub)
	signer, err := f.core.Signer("k-rsa", ClientInfo{Purpose: "test connection", Destination: "db"})
	if err != nil {
		t.Fatal(err)
	}
	client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User: "deploy", Auth: []ssh.AuthMethod{ssh.PublicKeys(signer)}, HostKeyCallback: ssh.FixedHostKey(hostKey),
	})
	if err != nil {
		t.Fatalf("in-process signer: %v", err)
	}
	_ = client.Close()
	if ev := f.log.last(t); !ev.InProcess || ev.KeyID != "k-rsa" || ev.Outcome != domain.SignAllowed {
		t.Fatalf("in-process event = %+v", ev)
	}

	f.conf.answer = false
	conn, _ := net.Dial("unix", path)
	defer func() { _ = conn.Close() }()
	edAddr, edHost := testSSHD(t, edPub)
	if _, err := ssh.Dial("tcp", edAddr, &ssh.ClientConfig{
		User: "deploy", Auth: []ssh.AuthMethod{ssh.PublicKeysCallback(sshagent.NewClient(conn).Signers)},
		HostKeyCallback: ssh.FixedHostKey(edHost),
	}); err == nil {
		t.Fatal("authenticated although the user denied the signature")
	}
}

// ssh-add talks to the socket like it would to any ssh-agent.
func TestEndToEndSSHAdd(t *testing.T) {
	sshAdd := "/usr/bin/ssh-add"
	if _, err := os.Stat(sshAdd); err != nil {
		t.Skip("no ssh-add")
	}
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "work", newEd25519(t), false)
	_, path := startListener(t, f)
	run := func(args ...string) string {
		t.Helper()
		cmd := exec.Command(sshAdd, args...) //nolint:gosec // fixed binary, test-only
		cmd.Env = []string{"SSH_AUTH_SOCK=" + path, "PATH=/usr/bin:/bin"}
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("ssh-add %v: %v\n%s", args, err, out)
		}
		t.Logf("$ SSH_AUTH_SOCK=%s ssh-add %s\n%s", path, strings.Join(args, " "), out)
		return string(out)
	}
	if out := run("-l"); !strings.Contains(out, ssh.FingerprintSHA256(pub)) || !strings.Contains(out, "work@zish") || !strings.Contains(out, "(ED25519)") {
		t.Fatalf("ssh-add -l = %q", out)
	}
	if out := run("-L"); !strings.Contains(out, strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pub)))) {
		t.Fatalf("ssh-add -L = %q", out)
	}

	keyFile := filepath.Join(t.TempDir(), "temp_ed25519")
	block, _ := ssh.MarshalPrivateKey(newEd25519(t), "temp@test")
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
	run("-t", "60", "-c", keyFile)
	if _, temp := f.core.Snapshot(); len(temp) != 1 || !temp[0].RequireConfirm || temp[0].ExpiresAt == nil {
		t.Fatalf("ssh-add -t 60 -c: %+v", temp)
	}
	run("-D")
	if out := run("-l"); !strings.Contains(out, "work@zish") || strings.Contains(out, "temp@test") {
		t.Fatalf("after -D: %q", out)
	}
}

// The real /usr/bin/ssh, given exactly the argv the launcher builds for a
// Zish-key server, authenticates through the agent at a socket path with a
// space in it.
func TestEndToEndOpenSSHWithLauncherArgv(t *testing.T) {
	if _, err := os.Stat(launcher.SSHPath); err != nil {
		t.Skip("no /usr/bin/ssh")
	}
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "work", newEd25519(t), false)
	dir := socketDir(t, "z e")
	sock := filepath.Join(dir, "run dir", "agent.sock")
	if err := os.Mkdir(filepath.Dir(sock), 0o700); err != nil {
		t.Fatal(err)
	}
	l := NewListener(f.core)
	if err := l.Start(sock); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(l.Stop)
	pubFile := filepath.Join(dir, "k1.pub")
	if err := os.WriteFile(pubFile, ssh.MarshalAuthorizedKey(pub), 0o600); err != nil {
		t.Fatal(err)
	}

	addr, hostKey := testSSHD(t, pub)
	host, portStr, _ := net.SplitHostPort(addr)
	port, _ := strconv.Atoi(portStr)
	kh := filepath.Join(dir, "known_hosts")
	if err := os.WriteFile(kh, []byte(knownhosts.Line([]string{addr}, hostKey)+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	keyID := "k1"
	plan, err := launcher.BuildPlan([]domain.Server{{ID: "s", Name: "s", Host: host, Port: port, User: "deploy", AuthType: domain.AuthZishKey, AgentKeyID: &keyID}},
		launcher.Options{SSHPath: launcher.SSHPath, Agent: launcher.AgentPaths{Socket: sock, PubKeyPath: func(string) string { return pubFile }}}, "")
	if err != nil {
		t.Fatal(err)
	}
	// Isolate from the developer's ssh config and agent; the trust store is
	// a temp known_hosts seeded with the server's key.
	args := append([]string{"-F", "/dev/null", "-o", `UserKnownHostsFile="` + kh + `"`, "-o", "BatchMode=yes"}, plan.Argv[1:]...)
	args = append(args, "true")
	cmd := exec.Command(launcher.SSHPath, args...) //nolint:gosec // fixed binary, test-only
	cmd.Env = []string{"PATH=/usr/bin:/bin", "HOME=" + dir}
	out, err := cmd.CombinedOutput()
	if err != nil || !strings.Contains(string(out), "authenticated") {
		t.Fatalf("ssh %q: %v\n%s", args, err, out)
	}
	ev := f.log.last(t)
	if ev.KeyID != "k1" || ev.Outcome != domain.SignAllowed || ev.ClientName != "ssh" {
		t.Fatalf("event = %+v", ev)
	}
	// OpenSSH sends session-bind before signing; with no resolver the
	// destination is the verified host key's fingerprint.
	if want := "host key " + shortFingerprint(ssh.FingerprintSHA256(hostKey)); ev.Destination != want || ev.Forwarded {
		t.Fatalf("destination = %q forwarded %v, want %q", ev.Destination, ev.Forwarded, want)
	}
}
