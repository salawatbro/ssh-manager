//go:build darwin

package agent

import (
	"errors"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	sshagent "golang.org/x/crypto/ssh/agent"

	"github.com/salawat/sshmgr/internal/domain"
)

// socketDir is a short private folder under /tmp: t.TempDir() paths can
// exceed macOS's 104-byte sun_path.
func socketDir(t *testing.T, pattern string) string {
	t.Helper()
	dir, err := os.MkdirTemp("/tmp", pattern)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	if err := os.Chmod(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return dir
}

func startListener(t *testing.T, f *fixture) (*Listener, string) {
	t.Helper()
	path := filepath.Join(socketDir(t, "za"), "agent.sock")
	l := NewListener(f.core)
	if err := l.Start(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(l.Stop)
	return l, path
}

func dialAgent(t *testing.T, path string) sshagent.ExtendedAgent {
	t.Helper()
	c, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return sshagent.NewClient(c)
}

func TestListenerServesOverARealSocket(t *testing.T) {
	f := newFixture(t)
	confirmPub := f.keys.add(t, "k1", "work", newEd25519(t), true)
	plainPub := f.keys.add(t, "k2", "ci", newP256(t), false)
	l, path := startListener(t, f)

	fi, err := os.Lstat(path)
	if err != nil || fi.Mode()&fs.ModeSocket == 0 || fi.Mode().Perm() != 0o600 {
		t.Fatalf("socket mode = %v, %v", fi.Mode(), err)
	}
	if di, _ := os.Stat(filepath.Dir(path)); di.Mode().Perm() != 0o700 {
		t.Fatalf("dir mode = %v", di.Mode())
	}
	if !l.Running() {
		t.Fatal("not running")
	}

	ag := dialAgent(t, path)
	keys, err := ag.List()
	if err != nil || len(keys) != 2 {
		t.Fatalf("List = %d, %v", len(keys), err)
	}
	sig, err := ag.Sign(plainPub, []byte("data"))
	if err != nil {
		t.Fatal(err)
	}
	verify(t, plainPub, []byte("data"), sig)
	ev := f.log.last(t)
	if ev.ClientPID != os.Getpid() || ev.ClientName == "" || ev.ClientChain == "" {
		t.Fatalf("attribution = %+v", ev)
	}

	f.conf.answer = false
	if _, err := ag.Sign(confirmPub, []byte("data")); err == nil {
		t.Fatal("signed after the user denied")
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignDenied {
		t.Fatalf("outcome = %q", ev.Outcome)
	}

	f.lock.v.Store(true)
	if _, err := ag.Sign(plainPub, []byte("data")); err == nil {
		t.Fatal("signed while the app is locked")
	}
	if ev := f.log.last(t); ev.Outcome != domain.SignLocked {
		t.Fatalf("outcome = %q", ev.Outcome)
	}
	if reqs := f.conf.requests(); !reqs[len(reqs)-1].Locked {
		t.Fatal("locked request did not ask for device-owner authentication")
	}

	l.Stop()
	if _, err := os.Lstat(path); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("Stop left the socket: %v", err)
	}
	if l.Running() {
		t.Fatal("still running after Stop")
	}
}

func TestListenerStaleAndForeignSockets(t *testing.T) {
	f := newFixture(t)
	dir := socketDir(t, "zb")
	path := filepath.Join(dir, "agent.sock")

	// A crashed Zish leaves its socket file behind.
	stale, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	stale.SetUnlinkOnClose(false)
	_ = stale.Close()
	if _, err := os.Lstat(path); err != nil {
		t.Fatalf("stale socket not left behind: %v", err)
	}
	l := NewListener(f.core)
	if err := l.Start(path); err != nil {
		t.Fatalf("stale socket not cleaned up: %v", err)
	}
	if err := l.Start(path); err == nil {
		t.Fatal("second Start on a running listener succeeded")
	}

	// A live socket belongs to another agent: never remove it.
	second := NewListener(f.core)
	if err := second.Start(path); !errors.Is(err, ErrSocketInUse) {
		t.Fatalf("second listener on a live socket = %v", err)
	}
	l.Stop()

	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := NewListener(f.core).Start(path); err == nil {
		t.Fatal("started over a regular file")
	}
	_ = os.Remove(path)
	if err := os.Symlink("/tmp", path); err != nil {
		t.Fatal(err)
	}
	if err := NewListener(f.core).Start(path); err == nil {
		t.Fatal("started over a symlink")
	}
}

func TestListenerRefusesOtherUsers(t *testing.T) {
	f := newFixture(t)
	f.keys.add(t, "k1", "work", newEd25519(t), false)
	path := filepath.Join(socketDir(t, "zc"), "agent.sock")
	l := NewListener(f.core)
	l.peer = func(*net.UnixConn) (int, int, error) { return os.Getuid() + 1, 1, nil }
	if err := l.Start(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(l.Stop)
	c, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := sshagent.NewClient(c).List(); err == nil {
		t.Fatal("served a different uid")
	}
}

func TestListenerCapsConnections(t *testing.T) {
	f := newFixture(t)
	path := filepath.Join(socketDir(t, "zd"), "agent.sock")
	l := NewListener(f.core)
	l.maxConns = 1
	if err := l.Start(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(l.Stop)
	first := dialAgent(t, path)
	if _, err := first.List(); err != nil {
		t.Fatal(err)
	}
	c, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := sshagent.NewClient(c).List(); err == nil {
		t.Fatal("connection over the cap was served")
	}
}
