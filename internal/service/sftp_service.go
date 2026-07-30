package service

import (
	"context"
	"errors"
	"sync"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sftpx"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// sftpSession is the slice of *sftpx.Session the service depends on, named as
// an interface so tests can inject a fake without a real SFTP/SSH connection.
type sftpSession interface {
	List(dir string) ([]sftpx.FileEntry, error)
	Home() (string, error)
	Mkdir(path string) error
	Remove(path string) error
	Rename(oldPath, newPath string) error
	CreateFile(path string) error
	ReadFile(path string) (string, error)
	WriteFile(path, content string) error
	Upload(ctx context.Context, localPath, remoteDir string, onProgress func(sftpx.Progress)) error
	Download(ctx context.Context, remotePath, localDir string, onProgress func(sftpx.Progress)) error
	Close() error
}

// var _ sftpSession = (*sftpx.Session)(nil) is a compile-time check that
// *sftpx.Session still satisfies sftpSession: a future signature drift fails
// right here with a clear message, instead of surfacing elsewhere.
var _ sftpSession = (*sftpx.Session)(nil)

// sftpConn pairs the SFTP session with the SSH connection it rides on; both are
// closed together. conn is nil in tests (Close guards it).
type sftpConn struct {
	session sftpSession
	conn    *sshx.Conn
}

// SftpService opens per-server SFTP sessions over the shared dialer and runs
// file transfers, emitting sftp:progress. Its own view (frontend) is separate
// from terminal sessions.
type SftpService struct {
	repo    *store.ServerRepo
	secret  secret.Store
	dialer  Dialer
	emitter Emitter

	mu        sync.Mutex
	sessions  map[string]*sftpConn
	transfers map[string]context.CancelFunc
}

// NewSftpService wires the service to its repo, keychain, dialer and event emitter.
func NewSftpService(repo *store.ServerRepo, sec secret.Store, dialer Dialer, emitter Emitter) *SftpService {
	return &SftpService{
		repo: repo, secret: sec, dialer: dialer, emitter: emitter,
		sessions: map[string]*sftpConn{}, transfers: map[string]context.CancelFunc{},
	}
}

// Open dials serverID (reusing the auth/keychain/host-key/TOTP path), starts an
// SFTP session, and returns its id. Mirrors SSHService.Open's dial+zero.
func (s *SftpService) Open(serverID string) (string, error) {
	srv, err := s.repo.Get(serverID)
	if err != nil {
		return "", err
	}
	chain, err := resolveChain(s.repo, s.secret, srv)
	if err != nil {
		return "", err
	}
	conn, err := s.dialer.DialChain(context.Background(), chain)
	zeroChainCreds(chain) // SEC-10
	if err != nil {
		return "", err
	}
	sess, err := sftpx.Open(conn.Client)
	if err != nil {
		_ = conn.Close()
		return "", domain.NewError(domain.CodeConnRefused, "Connected, but could not start SFTP on the server.")
	}
	id := uuid.NewString()
	s.mu.Lock()
	s.sessions[id] = &sftpConn{session: sess, conn: conn}
	s.mu.Unlock()
	return id, nil
}

func (s *SftpService) get(sessionID string) (sftpSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.sessions[sessionID]
	if !ok {
		return nil, domain.NewError(domain.CodeSessionClosed, "This file session is no longer open. Reopen the browser.")
	}
	return sc.session, nil
}

// Close ends an SFTP session and its SSH connection.
func (s *SftpService) Close(sessionID string) error {
	s.mu.Lock()
	sc, ok := s.sessions[sessionID]
	delete(s.sessions, sessionID)
	s.mu.Unlock()
	if !ok {
		return nil
	}
	err := sc.session.Close()
	if sc.conn != nil {
		_ = sc.conn.Close()
	}
	return err
}

// ListRemote lists dir on the remote side of an open SFTP session.
func (s *SftpService) ListRemote(sessionID, dir string) ([]sftpx.FileEntry, error) {
	sess, err := s.get(sessionID)
	if err != nil {
		return nil, err
	}
	return sess.List(dir)
}

// RemoteHome is the session's initial remote directory.
func (s *SftpService) RemoteHome(sessionID string) (string, error) {
	sess, err := s.get(sessionID)
	if err != nil {
		return "", err
	}
	return sess.Home()
}

// Mkdir creates a directory on the remote side of an open SFTP session.
func (s *SftpService) Mkdir(sessionID, path string) error {
	sess, err := s.get(sessionID)
	if err != nil {
		return err
	}
	return sess.Mkdir(path)
}

// Remove deletes a remote file, or a directory and everything under it.
func (s *SftpService) Remove(sessionID, path string) error {
	sess, err := s.get(sessionID)
	if err != nil {
		return err
	}
	return sess.Remove(path)
}

// Rename moves/renames a remote path.
func (s *SftpService) Rename(sessionID, oldPath, newPath string) error {
	sess, err := s.get(sessionID)
	if err != nil {
		return err
	}
	return sess.Rename(oldPath, newPath)
}

// CreateFile creates a new empty file on the remote side ("New file…").
func (s *SftpService) CreateFile(sessionID, path string) error {
	sess, err := s.get(sessionID)
	if err != nil {
		return err
	}
	return sess.CreateFile(path)
}

// ListLocal needs no session — the left pane is the local FS.
func (s *SftpService) ListLocal(dir string) ([]sftpx.FileEntry, error) { return sftpx.ListLocal(dir) }

// LocalHome needs no session — the left pane is the local FS.
func (s *SftpService) LocalHome() (string, error) { return sftpx.LocalHome() }

// The four below give the local pane the same mutations the remote side has —
// none need a session, since the left pane is the local filesystem.

// MkdirLocal creates a directory on the local side.
func (s *SftpService) MkdirLocal(path string) error { return sftpx.MkdirLocal(path) }

// RenameLocal renames a local path (refusing to overwrite an existing target).
func (s *SftpService) RenameLocal(oldPath, newPath string) error {
	return sftpx.RenameLocal(oldPath, newPath)
}

// RemoveLocal deletes a local file, or a directory and everything under it.
func (s *SftpService) RemoveLocal(path string) error { return sftpx.RemoveLocal(path) }

// CreateLocalFile creates a new empty local file ("New file…").
func (s *SftpService) CreateLocalFile(path string) error { return sftpx.CreateLocalFile(path) }

// ReadFile returns a remote text file's contents for the editor.
func (s *SftpService) ReadFile(sessionID, path string) (string, error) {
	sess, err := s.get(sessionID)
	if err != nil {
		return "", err
	}
	content, err := sess.ReadFile(path)
	return content, mapEditErr(err)
}

// WriteFile replaces a remote file's contents from the editor (atomic).
func (s *SftpService) WriteFile(sessionID, path, content string) error {
	sess, err := s.get(sessionID)
	if err != nil {
		return err
	}
	return mapEditErr(sess.WriteFile(path, content))
}

// ReadLocalFile / WriteLocalFile edit the left pane's local files — no session.
func (s *SftpService) ReadLocalFile(path string) (string, error) {
	content, err := sftpx.ReadLocalFile(path)
	return content, mapEditErr(err)
}

// WriteLocalFile replaces a local file's contents from the editor (atomic).
func (s *SftpService) WriteLocalFile(path, content string) error {
	return mapEditErr(sftpx.WriteLocalFile(path, content))
}

// mapEditErr turns sftpx's two expected rejections into coded validation errors
// the frontend can show; any real IO error passes through unchanged (and nil
// stays nil).
func mapEditErr(err error) error {
	switch {
	case errors.Is(err, sftpx.ErrTooLarge):
		return domain.NewError(domain.CodeValidation, "This file is too large to edit (2 MB limit).")
	case errors.Is(err, sftpx.ErrBinary):
		return domain.NewError(domain.CodeValidation, "This is not a text file, so it can’t be edited here.")
	default:
		return err
	}
}

// Upload streams localPath to remoteDir on the session and returns a transferID
// immediately; the copy runs in a goroutine, emitting sftp:progress as it goes
// and a terminal Finished (with Error, if any). CancelTransfer(transferID) aborts it.
func (s *SftpService) Upload(sessionID, localPath, remoteDir string) (string, error) {
	sess, err := s.get(sessionID)
	if err != nil {
		return "", err
	}
	return s.run("upload", func(ctx context.Context, id string) error {
		return sess.Upload(ctx, localPath, remoteDir, s.progressFn(id, "upload"))
	}), nil
}

// Download is Upload's mirror: remotePath -> localDir.
func (s *SftpService) Download(sessionID, remotePath, localDir string) (string, error) {
	sess, err := s.get(sessionID)
	if err != nil {
		return "", err
	}
	return s.run("download", func(ctx context.Context, id string) error {
		return sess.Download(ctx, remotePath, localDir, s.progressFn(id, "download"))
	}), nil
}

// CancelTransfer aborts an in-flight transfer.
func (s *SftpService) CancelTransfer(transferID string) error {
	s.mu.Lock()
	cancel, ok := s.transfers[transferID]
	s.mu.Unlock()
	if !ok {
		return domain.NewError(domain.CodeValidation, "That transfer is no longer running.")
	}
	cancel()
	return nil
}

// run registers a cancellable transfer, launches fn in a goroutine, and emits a
// terminal Finished event (with Error on failure) before deregistering.
func (s *SftpService) run(direction string, fn func(ctx context.Context, id string) error) string {
	ctx, cancel := context.WithCancel(context.Background())
	id := uuid.NewString()
	s.mu.Lock()
	s.transfers[id] = cancel
	s.mu.Unlock()
	go func() {
		err := fn(ctx, id)
		s.mu.Lock()
		delete(s.transfers, id)
		s.mu.Unlock()
		cancel()
		fin := SftpProgress{TransferID: id, Direction: direction, Finished: true}
		if err != nil {
			fin.Error = err.Error()
		}
		s.emitter.Emit("sftp:progress", fin)
	}()
	return id
}

// progressFn adapts sftpx.Progress into throttled sftp:progress events. It emits
// on every callback; sftpx already batches per copy chunk (~32KB), so this stays
// cheap without extra time-based throttling.
func (s *SftpService) progressFn(id, direction string) func(sftpx.Progress) {
	return func(p sftpx.Progress) {
		s.emitter.Emit("sftp:progress", SftpProgress{
			TransferID: id, Direction: direction,
			CurrentFile: p.CurrentFile, Done: p.Done, Total: p.Total,
		})
	}
}
