package service

import (
	"context"
	"testing"

	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sftpx"
	"github.com/salawat/sshmgr/internal/store"
)

// fakeSession implements sftpSession without any real SFTP/SSH, so the service
// coordination (session tracking, delegation, errors) is unit-testable.
type fakeSession struct {
	listed   string
	removed  string
	closed   bool
	uploads  []string
	progress []sftpx.Progress // scripted progress the transfer will emit
	transErr error
}

func (f *fakeSession) List(dir string) ([]sftpx.FileEntry, error) {
	f.listed = dir
	return []sftpx.FileEntry{{Name: "a.txt"}}, nil
}
func (f *fakeSession) Home() (string, error)       { return "/home/x", nil }
func (f *fakeSession) Mkdir(string) error          { return nil }
func (f *fakeSession) Remove(p string) error       { f.removed = p; return nil }
func (f *fakeSession) Rename(string, string) error { return nil }
func (f *fakeSession) Close() error                { f.closed = true; return nil }
func (f *fakeSession) Upload(ctx context.Context, local string, _ string, on func(sftpx.Progress)) error {
	f.uploads = append(f.uploads, local)
	for _, p := range f.progress {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		on(p)
	}
	return f.transErr
}
func (f *fakeSession) Download(_ context.Context, _, _ string, on func(sftpx.Progress)) error {
	for _, p := range f.progress {
		on(p)
	}
	return f.transErr
}

func newSftpService(t *testing.T) (*SftpService, *store.ServerRepo, *capEmitterS) {
	t.Helper()
	db, err := store.Open(t.TempDir() + "/db.sqlite")
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	repo := store.NewServerRepo(db)
	em := &capEmitterS{}
	return NewSftpService(repo, secret.NewFake(), &fakeDialer{}, em), repo, em
}

// inject puts a ready fake session into the service, bypassing the dial that
// Open performs, so remote-op and transfer coordination can be tested without
// an SSH server.
func inject(s *SftpService, id string, fs sftpSession) {
	s.mu.Lock()
	s.sessions[id] = &sftpConn{session: fs}
	s.mu.Unlock()
}

type capEmitterS struct{ events []any }

func (c *capEmitterS) Emit(_ string, data ...any) bool {
	if len(data) > 0 {
		c.events = append(c.events, data[0])
	}
	return true
}

func TestSftpOpenUnknownServer(t *testing.T) {
	svc, _, _ := newSftpService(t)
	if _, err := svc.Open("nope"); err == nil {
		t.Fatal("Open unknown server returned nil error")
	}
}

func TestSftpListRemoteDelegates(t *testing.T) {
	svc, _, _ := newSftpService(t)
	fs := &fakeSession{}
	inject(svc, "sid", fs)
	entries, err := svc.ListRemote("sid", "/tmp")
	if err != nil {
		t.Fatalf("ListRemote error = %v", err)
	}
	if fs.listed != "/tmp" || len(entries) != 1 {
		t.Fatalf("delegate failed: listed=%q entries=%d", fs.listed, len(entries))
	}
}

func TestSftpRemoteOpUnknownSession(t *testing.T) {
	svc, _, _ := newSftpService(t)
	if _, err := svc.ListRemote("ghost", "/"); err == nil {
		t.Fatal("ListRemote on unknown session returned nil error")
	}
}

func TestSftpListLocalNoSession(t *testing.T) {
	svc, _, _ := newSftpService(t)
	entries, err := svc.ListLocal(t.TempDir())
	if err != nil {
		t.Fatalf("ListLocal error = %v", err)
	}
	if entries == nil {
		t.Fatal("ListLocal returned nil slice")
	}
}

func TestSftpCloseClearsSession(t *testing.T) {
	svc, _, _ := newSftpService(t)
	fs := &fakeSession{}
	inject(svc, "sid", fs)
	if err := svc.Close("sid"); err != nil {
		t.Fatalf("Close error = %v", err)
	}
	if !fs.closed {
		t.Fatal("Close did not close the session")
	}
	if _, err := svc.ListRemote("sid", "/"); err == nil {
		t.Fatal("session still present after Close")
	}
}
