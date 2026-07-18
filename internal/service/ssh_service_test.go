package service

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
	"github.com/salawat/sshmgr/internal/term"
)

// fakePTY implements term.PTY for delegation tests. Read blocks on closed
// (never returns data — these tests never exercise the reader) until Close
// closes it, then returns io.EOF. Without this, term.Manager.Add's reader
// goroutine — which calls Read in a loop — would sit in an unblockable
// select{} forever: Close only unblocks a pty whose Read actually observes
// the close, and a leaked goroutine per test would eventually show up under
// -race or a leak detector.
type fakePTY struct {
	mu         sync.Mutex
	written    []byte
	cols, rows int
	closed     chan struct{}
	closeOnce  sync.Once
}

func newFakePTY() *fakePTY {
	return &fakePTY{closed: make(chan struct{})}
}

func (p *fakePTY) Read([]byte) (int, error) {
	<-p.closed
	return 0, io.EOF
}

func (p *fakePTY) Write(b []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.written = append(p.written, b...)
	return len(b), nil
}

func (p *fakePTY) Resize(c, r int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cols, p.rows = c, r
	return nil
}

func (p *fakePTY) KeepAlive() error { return nil }

func (p *fakePTY) Close() error {
	p.closeOnce.Do(func() { close(p.closed) })
	return nil
}

type nopEmitter struct{}

func (nopEmitter) Emit(string, ...any) bool { return true }

func newRepo(t *testing.T) *store.ServerRepo {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	return store.NewServerRepo(db)
}

func passwordServer(t *testing.T, repo *store.ServerRepo) *domain.Server {
	t.Helper()
	s := &domain.Server{ID: "s1", Name: "box", Host: "10.0.0.9", Port: 22, User: "u", AuthType: domain.AuthPassword}
	if err := repo.Create(s); err != nil {
		t.Fatal(err)
	}
	return s
}

// Open with no stored password fails at credsFor — the dialer is never called.
func TestOpenMissingPasswordDoesNotDial(t *testing.T) {
	repo := newRepo(t)
	passwordServer(t, repo)
	dialer := &fakeDialer{}
	mgr := term.NewManager(nopEmitter{}, time.Hour, time.Hour)
	svc := NewSSHService(nil, repo, secret.NewFake(), dialer, mgr, nil)

	_, err := svc.Open("s1", 80, 24)
	var de *domain.Error
	if err == nil || !errors.As(err, &de) || de.Code != domain.CodeAuthFailed {
		t.Fatalf("want ERR_AUTH_FAILED, got %v", err)
	}
	if dialer.dialed {
		t.Fatal("dialer should not be called when creds are missing")
	}
}

// A dial failure propagates its code and adds no session.
func TestOpenDialFailurePropagates(t *testing.T) {
	repo := newRepo(t)
	passwordServer(t, repo)
	sec := secret.NewFake()
	_ = sec.SetPassword("s1", "pw")
	dialer := &fakeDialer{dialErr: domain.NewError(domain.CodeConnRefused, "Connection refused.")}
	svc := NewSSHService(nil, repo, sec, dialer, term.NewManager(nopEmitter{}, time.Hour, time.Hour), nil)

	_, err := svc.Open("s1", 80, 24)
	var de *domain.Error
	if err == nil || !errors.As(err, &de) || de.Code != domain.CodeConnRefused {
		t.Fatalf("want ERR_CONN_REFUSED, got %v", err)
	}
}

// SubmitCode delegates to the wired CodePrompter's Resolve: a pending
// Prompt blocked on the prompter's channel unblocks with the submitted code.
func TestSubmitCodeDelegatesToPrompterResolve(t *testing.T) {
	cp := NewCodePrompter(&fakeCodeEmitter{})
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, term.NewManager(nopEmitter{}, time.Hour, time.Hour), cp)

	go func() {
		// Wait until Prompt has registered its channel, then submit.
		time.Sleep(20 * time.Millisecond)
		if err := svc.SubmitCode("r1", "123456"); err != nil {
			t.Errorf("SubmitCode: %v", err)
		}
	}()
	code, err := cp.Prompt(sshx.CodeRequest{RequestID: "r1"})
	if err != nil || code != "123456" {
		t.Fatalf("code=%q err=%v", code, err)
	}
}

// SubmitCode for an unknown request id is an error (stale submit after
// timeout, or a code prompter with nothing pending at all).
func TestSubmitCodeUnknownRequestErrors(t *testing.T) {
	cp := NewCodePrompter(&fakeCodeEmitter{})
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, term.NewManager(nopEmitter{}, time.Hour, time.Hour), cp)
	if err := svc.SubmitCode("ghost", "123456"); err == nil {
		t.Fatal("SubmitCode on an unknown request id should error")
	}
}

// Write/Resize/Close delegate to the manager.
func TestWriteResizeCloseDelegate(t *testing.T) {
	mgr := term.NewManager(nopEmitter{}, time.Hour, time.Hour)
	pty := newFakePTY()
	mgr.Add("sX", pty)
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, mgr, nil)

	if err := svc.Write("sX", base64.StdEncoding.EncodeToString([]byte("hi"))); err != nil {
		t.Fatal(err)
	}
	if err := svc.Resize("sX", 120, 40); err != nil {
		t.Fatal(err)
	}
	// Write is synchronous (mgr.Write calls pty.Write directly) — assert
	// immediately, no wait needed.
	pty.mu.Lock()
	written, cols, rows := string(pty.written), pty.cols, pty.rows
	pty.mu.Unlock()
	if written != "hi" {
		t.Fatalf("write not delegated: %q", written)
	}
	if cols != 120 || rows != 40 {
		t.Fatalf("resize not delegated: %dx%d", cols, rows)
	}
	if err := svc.Close("sX"); err != nil {
		t.Fatal(err)
	}
}

// Broadcast fans a single write out to every listed session id (FR-15). A
// fully-known list writes to all of them and returns nil.
func TestBroadcastWritesToEverySession(t *testing.T) {
	mgr := term.NewManager(nopEmitter{}, time.Hour, time.Hour)
	ptyA, ptyB := newFakePTY(), newFakePTY()
	mgr.Add("a", ptyA)
	mgr.Add("b", ptyB)
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, mgr, nil)

	payload := base64.StdEncoding.EncodeToString([]byte("hi"))
	if err := svc.Broadcast([]string{"a", "b"}, payload); err != nil {
		t.Fatalf("Broadcast error = %v, want nil", err)
	}

	for name, p := range map[string]*fakePTY{"a": ptyA, "b": ptyB} {
		p.mu.Lock()
		written := string(p.written)
		p.mu.Unlock()
		if written != "hi" {
			t.Errorf("session %q written = %q, want %q", name, written, "hi")
		}
	}
}

// An unknown session id in the list must not stop the fan-out to the others
// — Broadcast is best-effort — and the method returns the FIRST error, not
// an aggregate.
func TestBroadcastUnknownSessionDoesNotAbortOthersAndReturnsFirstError(t *testing.T) {
	mgr := term.NewManager(nopEmitter{}, time.Hour, time.Hour)
	ptyA, ptyC := newFakePTY(), newFakePTY()
	mgr.Add("a", ptyA)
	mgr.Add("c", ptyC)
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, mgr, nil)

	payload := base64.StdEncoding.EncodeToString([]byte("hi"))
	err := svc.Broadcast([]string{"a", "ghost", "c"}, payload)
	if err == nil {
		t.Fatal("Broadcast error = nil, want the ghost session's error")
	}
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeNotFound {
		t.Fatalf("Broadcast error = %v, want ERR_NOT_FOUND (the first — and only — error in the list)", err)
	}

	for name, p := range map[string]*fakePTY{"a": ptyA, "c": ptyC} {
		p.mu.Lock()
		written := string(p.written)
		p.mu.Unlock()
		if written != "hi" {
			t.Errorf("session %q written = %q, want %q (unknown id must not abort the fan-out)", name, written, "hi")
		}
	}
}

// TestOpenRequestsPTYAtThePassedSize proves the actual bug end-to-end: Open
// must request the remote PTY at the xterm size the frontend passed in, not
// a hardcoded 80x24 (see internal/sshx/session.go's OpenSession, which
// requests whatever cols/rows it is given). The bug lives entirely in what
// Open itself hands to sshx.OpenSession — a call fakeDialer/fakePTY never
// exercise, since fakeDialer.DialChain returns no real *sshx.Conn and
// fakePTY.Resize just records an in-memory struct field. So unlike every
// other test in this file, this one stands up a real in-process SSH server
// (mirroring internal/sshx's own test doubles, e.g. session_test.go's
// newEchoServer) and a real *sshx.Dialer, and inspects the literal pty-req
// wire message — the only vantage point from which "Open asked for the
// wrong size" is actually observable.
func TestOpenRequestsPTYAtThePassedSize(t *testing.T) {
	addr, hostKey, dims := newPTYCapturingServer(t)
	host, port := splitTestAddr(t, addr)

	repo := newRepo(t)
	srv := &domain.Server{ID: "s1", Name: "box", Host: host, Port: port, User: "u", AuthType: domain.AuthPassword}
	if err := repo.Create(srv); err != nil {
		t.Fatal(err)
	}
	sec := secret.NewFake()
	if err := sec.SetPassword("s1", "pw"); err != nil {
		t.Fatal(err)
	}

	khPath := filepath.Join(t.TempDir(), "known_hosts")
	seedKnownHostForTest(t, khPath, addr, hostKey)
	v, err := sshx.NewVerifier(khPath, acceptAllHostKeys{})
	if err != nil {
		t.Fatal(err)
	}
	dialer := sshx.NewDialer(v, 5*time.Second, 20*time.Second)
	mgr := term.NewManager(nopEmitter{}, time.Hour, time.Hour)
	svc := NewSSHService(nil, repo, sec, dialer, mgr, nil)

	sessionID, err := svc.Open("s1", 120, 40)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = svc.Close(sessionID) }()

	select {
	case got := <-dims:
		if got != [2]int{120, 40} {
			t.Fatalf("pty-req dims (cols, rows) = %v, want [120 40] (the size Open was asked for)", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for the server's pty-req")
	}
}

// acceptAllHostKeys satisfies sshx.HostKeyPrompter. It is only ever needed
// to construct a *sshx.Verifier — TestOpenRequestsPTYAtThePassedSize always
// seeds known_hosts up front, so the callback never actually has to prompt.
type acceptAllHostKeys struct{}

func (acceptAllHostKeys) Prompt(sshx.HostKeyRequest) (bool, error) { return true, nil }

// ptyReqPayload mirrors the SSH_MSG_CHANNEL_REQUEST "pty-req" payload (RFC
// 4254 §6.2): term, then character width/height, then pixel width/height,
// then terminal modes. Only Cols/Rows matter to this test.
type ptyReqPayload struct {
	Term     string
	Cols     uint32
	Rows     uint32
	WidthPx  uint32
	HeightPx uint32
	Modes    string
}

// newPTYCapturingServer starts an in-process, no-auth SSH server that
// accepts one session channel, grants any PTY/shell/window-change request,
// and pushes the exact (cols, rows) each pty-req asked for onto the
// returned channel — the only way to see, from outside the process, what
// window size Open actually requested.
func newPTYCapturingServer(t *testing.T) (addr string, hostKey ssh.PublicKey, dims chan [2]int) {
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

	dims = make(chan [2]int, 4)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go servePTYCapture(c, cfg, dims)
		}
	}()
	return ln.Addr().String(), signer.PublicKey(), dims
}

func servePTYCapture(c net.Conn, cfg *ssh.ServerConfig, dims chan [2]int) {
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
					case "pty-req":
						var p ptyReqPayload
						if err := ssh.Unmarshal(req.Payload, &p); err == nil {
							dims <- [2]int{int(p.Cols), int(p.Rows)}
						}
						_ = req.Reply(true, nil)
					case "shell", "window-change":
						_ = req.Reply(true, nil)
					default:
						_ = req.Reply(false, nil)
					}
				}
			}()
			_ = ch // no I/O needed — Open only has to succeed, not echo
		}
	}()
	_ = sc.Wait()
}

// splitTestAddr splits addr ("127.0.0.1:54321") into a host and int port for
// building a domain.Server that points at an in-process test listener.
func splitTestAddr(t *testing.T, addr string) (string, int) {
	t.Helper()
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatalf("splitTestAddr(%q): %v", addr, err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("splitTestAddr(%q): %v", addr, err)
	}
	return host, port
}

// seedKnownHostForTest appends a known_hosts line for hostport/key to path,
// creating the parent dir (0700) and file (0600) as needed.
func seedKnownHostForTest(t *testing.T, path, hostport string, key ssh.PublicKey) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600) //nolint:gosec // G304: path is the test's own t.TempDir()-rooted known_hosts fixture, not external input.
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	if _, err := f.WriteString(knownhosts.Line([]string{hostport}, key) + "\n"); err != nil {
		t.Fatal(err)
	}
}
