package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sftpx"
	"github.com/salawat/sshmgr/internal/store"
)

// fakeSession implements sftpSession without any real SFTP/SSH, so the service
// coordination (session tracking, delegation, errors) is unit-testable.
type fakeSession struct {
	listed   string
	removed  string
	created  string
	closed   bool
	uploads  []string
	progress []sftpx.Progress // scripted progress the transfer will emit
	transErr error
	// read is what ReadFile returns; wrote records the last WriteFile so the
	// service delegation is checked without a real SFTP server (edit.go's own
	// tests cover the atomic write).
	read     string
	readErr  error
	wrote    [2]string
	writeErr error
}

func (f *fakeSession) List(dir string) ([]sftpx.FileEntry, error) {
	f.listed = dir
	return []sftpx.FileEntry{{Name: "a.txt"}}, nil
}
func (f *fakeSession) Home() (string, error)           { return "/home/x", nil }
func (f *fakeSession) Mkdir(string) error              { return nil }
func (f *fakeSession) Remove(p string) error           { f.removed = p; return nil }
func (f *fakeSession) Rename(string, string) error     { return nil }
func (f *fakeSession) CreateFile(p string) error       { f.created = p; return nil }
func (f *fakeSession) ReadFile(string) (string, error) { return f.read, f.readErr }
func (f *fakeSession) WriteFile(p, content string) error {
	f.wrote = [2]string{p, content}
	return f.writeErr
}
func (f *fakeSession) Close() error { f.closed = true; return nil }
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

// capEmitterS is -race-safe: the transfer goroutine calls Emit concurrently
// with the test goroutine's polling reads, so events is guarded by mu and
// only ever read back through snapshot()'s copy.
type capEmitterS struct {
	mu     sync.Mutex
	events []any
}

func (c *capEmitterS) Emit(_ string, data ...any) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(data) > 0 {
		c.events = append(c.events, data[0])
	}
	return true
}

// snapshot returns a copy of the captured events so callers never read the
// raw, mutex-guarded slice directly.
func (c *capEmitterS) snapshot() []any {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]any, len(c.events))
	copy(out, c.events)
	return out
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

func TestSftpUploadEmitsProgressAndFinishes(t *testing.T) {
	svc, _, em := newSftpService(t)
	fs := &fakeSession{progress: []sftpx.Progress{
		{CurrentFile: "a", Done: 5, Total: 10},
		{CurrentFile: "a", Done: 10, Total: 10},
	}}
	inject(svc, "sid", fs)

	id, err := svc.Upload("sid", "/local/a", "/remote")
	if err != nil {
		t.Fatalf("Upload error = %v", err)
	}
	if id == "" {
		t.Fatal("Upload returned empty transferID")
	}
	// The transfer runs in a goroutine; wait for the terminal event.
	waitForFinished(t, em)

	var finished *SftpProgress
	for _, ev := range em.snapshot() {
		if p, ok := ev.(SftpProgress); ok && p.Finished {
			p := p
			finished = &p
		}
	}
	if finished == nil {
		t.Fatal("no Finished sftp:progress emitted")
	}
	if finished.TransferID != id || finished.Direction != "upload" || finished.Error != "" {
		t.Fatalf("final event = %+v, want id=%s upload no-error", *finished, id)
	}
}

func TestSftpUploadEmitsErrorOnFailure(t *testing.T) {
	svc, _, em := newSftpService(t)
	fs := &fakeSession{transErr: errors.New("disk full")}
	inject(svc, "sid", fs)
	_, err := svc.Upload("sid", "/local/a", "/remote")
	if err != nil {
		t.Fatalf("Upload (async) should not return the transfer error synchronously: %v", err)
	}
	waitForFinished(t, em)
	var got *SftpProgress
	for _, ev := range em.snapshot() {
		if p, ok := ev.(SftpProgress); ok && p.Finished {
			p := p
			got = &p
		}
	}
	if got == nil || got.Error == "" {
		t.Fatalf("want a Finished event carrying Error, got %+v", got)
	}
}

func TestSftpCancelUnknownTransfer(t *testing.T) {
	svc, _, _ := newSftpService(t)
	if err := svc.CancelTransfer("nope"); err == nil {
		t.Fatal("CancelTransfer on unknown id returned nil error")
	}
}

func TestSftpReadWriteFileDelegate(t *testing.T) {
	svc, _, _ := newSftpService(t)
	fs := &fakeSession{read: "server { listen 80; }"}
	inject(svc, "sid", fs)

	got, err := svc.ReadFile("sid", "/etc/nginx.conf")
	if err != nil || got != "server { listen 80; }" {
		t.Fatalf("ReadFile = %q, %v", got, err)
	}
	if err := svc.WriteFile("sid", "/etc/nginx.conf", "server { listen 443; }"); err != nil {
		t.Fatalf("WriteFile error = %v", err)
	}
	if fs.wrote != [2]string{"/etc/nginx.conf", "server { listen 443; }"} {
		t.Fatalf("WriteFile did not delegate: %v", fs.wrote)
	}
}

// The frontend gates on name and size before opening, so hitting ErrBinary /
// ErrTooLarge here means the file changed under it — mapEditErr must surface a
// coded validation error the editor can show, not a bare string.
func TestSftpEditErrorsAreCodedValidation(t *testing.T) {
	svc, _, _ := newSftpService(t)
	inject(svc, "sid", &fakeSession{readErr: sftpx.ErrBinary})
	_, err := svc.ReadFile("sid", "/x")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("ReadFile(binary) err = %v, want CodeValidation", err)
	}
}

func TestSftpLocalReadWriteRoundTrip(t *testing.T) {
	svc, _, _ := newSftpService(t)
	p := t.TempDir() + "/notes.md"
	if err := svc.WriteLocalFile(p, "# hi\n"); err != nil {
		t.Fatalf("WriteLocalFile error = %v", err)
	}
	got, err := svc.ReadLocalFile(p)
	if err != nil || got != "# hi\n" {
		t.Fatalf("local round trip = %q, %v", got, err)
	}
}

// waitForFinished polls the captured emitter for a terminal event, up to ~2s,
// so the goroutine-run transfer is observed without a fixed sleep.
func waitForFinished(t *testing.T, em *capEmitterS) {
	t.Helper()
	for i := 0; i < 200; i++ {
		for _, ev := range em.snapshot() {
			if p, ok := ev.(SftpProgress); ok && p.Finished {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for a Finished sftp:progress event")
}
