package service

import (
	"context"
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
	Upload(ctx context.Context, localPath, remoteDir string, onProgress func(sftpx.Progress)) error
	Download(ctx context.Context, remotePath, localDir string, onProgress func(sftpx.Progress)) error
	Close() error
}

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

// ListLocal needs no session — the left pane is the local FS.
func (s *SftpService) ListLocal(dir string) ([]sftpx.FileEntry, error) { return sftpx.ListLocal(dir) }

// LocalHome needs no session — the left pane is the local FS.
func (s *SftpService) LocalHome() (string, error) { return sftpx.LocalHome() }
