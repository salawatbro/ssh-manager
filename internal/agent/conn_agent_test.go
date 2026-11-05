//go:build unix

package agent

import (
	"crypto/rand"
	"errors"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"
	"golang.org/x/sys/unix"

	"github.com/salawat/sshmgr/internal/domain"
)

// pipeAgent serves core on one end of a socketpair and returns a protocol
// client on the other.
func pipeAgent(t *testing.T, core *Core, client ClientInfo) sshagent.ExtendedAgent {
	t.Helper()
	fds, err := unix.Socketpair(unix.AF_UNIX, unix.SOCK_STREAM, 0)
	if err != nil {
		t.Fatal(err)
	}
	conns := make([]net.Conn, 2)
	for i, fd := range fds {
		f := os.NewFile(uintptr(fd), "agent")
		c, err := net.FileConn(f)
		_ = f.Close()
		if err != nil {
			t.Fatal(err)
		}
		conns[i] = c
	}
	t.Cleanup(func() { _ = conns[0].Close(); _ = conns[1].Close() })
	go func() { _ = core.Serve(conns[0], client) }()
	return sshagent.NewClient(conns[1])
}

func verify(t *testing.T, pub ssh.PublicKey, data []byte, sig *ssh.Signature) {
	t.Helper()
	if err := pub.Verify(data, sig); err != nil {
		t.Fatalf("signature does not verify: %v", err)
	}
}

func TestProtocolListAndSign(t *testing.T) {
	f := newFixture(t)
	edPub := f.keys.add(t, "k-ed", "work", newEd25519(t), false)
	ecPub := f.keys.add(t, "k-ec", "ec", newP256(t), false)
	rsaPub := f.keys.add(t, "k-rsa", "rsa", newRSA(t), false)
	ag := pipeAgent(t, f.core, ClientInfo{PID: 42, Name: "ssh", App: "Ghostty", Chain: []string{"ssh", "zsh"}})

	if err := ag.Add(sshagent.AddedKey{PrivateKey: newEd25519(t), Comment: "temp"}); err != nil {
		t.Fatal(err)
	}
	keys, err := ag.List()
	if err != nil || len(keys) != 4 {
		t.Fatalf("List = %d keys, %v", len(keys), err)
	}
	if keys[0].Comment != "work@zish" || keys[3].Comment != "temp" {
		t.Fatalf("comments = %q … %q", keys[0].Comment, keys[3].Comment)
	}

	data := []byte("session data")
	for _, pub := range []ssh.PublicKey{edPub, ecPub, rsaPub} {
		sig, err := ag.Sign(pub, data)
		if err != nil {
			t.Fatalf("Sign(%s) = %v", pub.Type(), err)
		}
		verify(t, pub, data, sig)
	}
	for flag, want := range map[sshagent.SignatureFlags]string{
		sshagent.SignatureFlagRsaSha256: ssh.KeyAlgoRSASHA256,
		sshagent.SignatureFlagRsaSha512: ssh.KeyAlgoRSASHA512,
	} {
		sig, err := ag.SignWithFlags(rsaPub, data, flag)
		if err != nil || sig.Format != want {
			t.Fatalf("flags %d: format %v, %v", flag, sig, err)
		}
		verify(t, rsaPub, data, sig)
	}
	ev := f.log.last(t)
	if ev.Outcome != domain.SignAllowed || ev.KeyID != "k-rsa" || ev.ClientPID != 42 || ev.ClientApp != "Ghostty" || ev.ClientChain != "ssh ← zsh" {
		t.Fatalf("event = %+v", ev)
	}
	if _, ok := f.keys.touched["k-rsa"]; !ok {
		t.Fatal("LastUsedAt not touched")
	}
	if _, err := ag.Sign(sshPubOf(t, newEd25519(t)), data); err == nil {
		t.Fatal("signed with an unknown key")
	}
}

func sshPubOf(t *testing.T, k any) ssh.PublicKey {
	t.Helper()
	s, err := ssh.NewSignerFromKey(k)
	if err != nil {
		t.Fatal(err)
	}
	return s.PublicKey()
}

func TestProtocolTempKeys(t *testing.T) {
	f := newFixture(t)
	storedKey := newEd25519(t)
	f.keys.add(t, "k1", "stored", storedKey, false)
	ag := pipeAgent(t, f.core, ClientInfo{Name: "ssh-add"})

	temp := newEd25519(t)
	if err := ag.Add(sshagent.AddedKey{PrivateKey: temp, Comment: "t", LifetimeSecs: 60, ConfirmBeforeUse: true}); err != nil {
		t.Fatal(err)
	}
	_, snap := f.core.Snapshot()
	if len(snap) != 1 || !snap[0].RequireConfirm || snap[0].ExpiresAt == nil || !snap[0].ExpiresAt.Equal(f.clk.Now().Add(time.Minute)) {
		t.Fatalf("snapshot = %+v", snap)
	}
	if _, err := ag.Sign(sshPubOf(t, temp), []byte("x")); err != nil {
		t.Fatal(err)
	}
	if reqs := f.conf.requests(); len(reqs) != 1 || reqs[0].KeyName != "t" {
		t.Fatalf("confirm constraint not honoured: %+v", reqs)
	}
	if ev := f.log.last(t); ev.KeyID != "" || ev.Outcome != domain.SignConfirmed {
		t.Fatalf("temp event = %+v", ev)
	}
	f.clk.advance(61 * time.Second)
	if keys, _ := ag.List(); len(keys) != 1 {
		t.Fatalf("expired temp key still listed: %d", len(keys))
	}

	refused := []sshagent.AddedKey{
		{PrivateKey: newEd25519(t), ConstraintExtensions: []sshagent.ConstraintExtension{{ExtensionName: "restrict-destination-v00@openssh.com"}}},
		{PrivateKey: storedKey},
		{PrivateKey: newEd25519(t), Certificate: certFor(t, newEd25519(t))},
	}
	for i, k := range refused {
		if err := ag.Add(k); err == nil {
			t.Fatalf("refused[%d] was accepted", i)
		}
	}
	for i := 0; i < maxTempKeys; i++ {
		if err := ag.Add(sshagent.AddedKey{PrivateKey: newEd25519(t)}); err != nil {
			t.Fatalf("add %d: %v", i, err)
		}
	}
	if err := ag.Add(sshagent.AddedKey{PrivateKey: newEd25519(t)}); err == nil {
		t.Fatal("cap not enforced")
	}
}

func certFor(t *testing.T, k any) *ssh.Certificate {
	t.Helper()
	ca, err := ssh.NewSignerFromKey(newEd25519(t))
	if err != nil {
		t.Fatal(err)
	}
	cert := &ssh.Certificate{Key: sshPubOf(t, k), CertType: ssh.UserCert, ValidBefore: ssh.CertTimeInfinity}
	if err := cert.SignCert(rand.Reader, ca); err != nil {
		t.Fatal(err)
	}
	return cert
}

func TestProtocolRemove(t *testing.T) {
	f := newFixture(t)
	storedPub := f.keys.add(t, "k1", "stored", newEd25519(t), false)
	ag := pipeAgent(t, f.core, ClientInfo{})
	temp := newEd25519(t)
	if err := ag.Add(sshagent.AddedKey{PrivateKey: temp}); err != nil {
		t.Fatal(err)
	}
	if err := ag.Remove(storedPub); err == nil {
		t.Fatal("removed a stored key")
	}
	if err := ag.Remove(sshPubOf(t, temp)); err != nil {
		t.Fatal(err)
	}
	if err := ag.Add(sshagent.AddedKey{PrivateKey: newEd25519(t)}); err != nil {
		t.Fatal(err)
	}
	if err := ag.RemoveAll(); err != nil {
		t.Fatal(err)
	}
	keys, _ := ag.List()
	if len(keys) != 1 || keys[0].Comment != "stored@zish" {
		t.Fatalf("RemoveAll touched stored keys: %+v", keys)
	}
}

func TestProtocolLockUnlock(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "stored", newEd25519(t), false)
	ag := pipeAgent(t, f.core, ClientInfo{})
	if err := ag.Lock([]byte("pw")); err != nil {
		t.Fatal(err)
	}
	if locked, _ := f.core.Snapshot(); !locked {
		t.Fatal("Snapshot not locked")
	}
	if keys, err := ag.List(); err != nil || len(keys) != 0 {
		t.Fatalf("List while locked = %d, %v", len(keys), err)
	}
	if _, err := ag.Sign(pub, []byte("x")); err == nil {
		t.Fatal("signed while locked")
	}
	if err := ag.Add(sshagent.AddedKey{PrivateKey: newEd25519(t)}); err == nil {
		t.Fatal("added while locked")
	}
	if err := ag.Unlock([]byte("wrong")); err == nil {
		t.Fatal("unlocked with the wrong passphrase")
	}
	if err := ag.Unlock([]byte("pw")); err != nil {
		t.Fatal(err)
	}
	if keys, _ := ag.List(); len(keys) != 1 {
		t.Fatalf("List after unlock = %d", len(keys))
	}
}

func sessionBindPayload(t *testing.T, host ssh.Signer, sid []byte, forwarding bool, tamper bool) []byte {
	t.Helper()
	sig, err := host.Sign(rand.Reader, sid)
	if err != nil {
		t.Fatal(err)
	}
	if tamper {
		sig.Blob[0] ^= 0xff
	}
	return ssh.Marshal(struct {
		HostKey    []byte
		SessionID  []byte
		Signature  []byte
		Forwarding bool
	}{host.PublicKey().Marshal(), sid, ssh.Marshal(sig), forwarding})
}

type mapResolver map[string]string

func (m mapResolver) Resolve(k ssh.PublicKey) Host { return Host{Name: m[ssh.FingerprintSHA256(k)]} }

func (m mapResolver) KeyOnProd(string) bool { return false }

func TestProtocolExtensions(t *testing.T) {
	f := newFixture(t)
	pub := f.keys.add(t, "k1", "work", newEd25519(t), true)
	host, _ := ssh.NewSignerFromKey(newEd25519(t))
	f.core.SetHostResolver(mapResolver{ssh.FingerprintSHA256(host.PublicKey()): "prod-db"})
	ag := pipeAgent(t, f.core, ClientInfo{Name: "ssh"})

	if _, err := ag.Extension("query", nil); !errors.Is(err, sshagent.ErrExtensionUnsupported) {
		t.Fatalf("unknown extension = %v", err)
	}
	if _, err := ag.Extension(extSessionBind, sessionBindPayload(t, host, []byte("sid"), false, true)); err == nil {
		t.Fatal("bad session-bind signature accepted")
	}
	if _, err := ag.Extension(extSessionBind, sessionBindPayload(t, host, []byte("sid"), true, false)); err != nil {
		t.Fatalf("valid session-bind = %v", err)
	}
	if _, err := ag.Sign(pub, []byte("x")); err != nil {
		t.Fatal(err)
	}
	req := f.conf.requests()[0]
	if req.Destination != "prod-db" || !req.Forwarded || req.Locked {
		t.Fatalf("confirm request = %+v", req)
	}
	if ev := f.log.last(t); ev.Destination != "prod-db" || !ev.Forwarded {
		t.Fatalf("event = %+v", ev)
	}
	if r := ConfirmReason(req); r != `use the SSH key "work" for ssh → prod-db (forwarded agent)` {
		t.Fatalf("reason = %q", r)
	}

	other, _ := ssh.NewSignerFromKey(newEd25519(t))
	if _, err := ag.Extension(extSessionBind, sessionBindPayload(t, other, []byte("sid2"), false, false)); err != nil {
		t.Fatal(err)
	}
	_, _ = ag.Sign(pub, []byte("y"))
	if req := f.conf.requests()[1]; !strings.HasPrefix(req.Destination, "host key SHA256:") {
		t.Fatalf("unknown host destination = %q", req.Destination)
	}
}
