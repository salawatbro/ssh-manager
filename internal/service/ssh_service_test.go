package service

import (
	"encoding/base64"
	"errors"
	"io"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
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
	svc := NewSSHService(nil, repo, secret.NewFake(), dialer, mgr)

	_, err := svc.Open("s1")
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
	svc := NewSSHService(nil, repo, sec, dialer, term.NewManager(nopEmitter{}, time.Hour, time.Hour))

	_, err := svc.Open("s1")
	var de *domain.Error
	if err == nil || !errors.As(err, &de) || de.Code != domain.CodeConnRefused {
		t.Fatalf("want ERR_CONN_REFUSED, got %v", err)
	}
}

// Write/Resize/Close delegate to the manager.
func TestWriteResizeCloseDelegate(t *testing.T) {
	mgr := term.NewManager(nopEmitter{}, time.Hour, time.Hour)
	pty := newFakePTY()
	mgr.Add("sX", pty)
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, mgr)

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
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, mgr)

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
	svc := NewSSHService(nil, newRepo(t), secret.NewFake(), &fakeDialer{}, mgr)

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
