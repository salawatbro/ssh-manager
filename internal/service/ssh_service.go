package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
	"github.com/salawat/sshmgr/internal/term"
)

// SSHService is bound to the frontend. It owns host-key confirmation (v0.2)
// and, from v0.3, the terminal session lifecycle: Open dials + starts a PTY +
// registers it with the term.Manager; Write/Resize/Close delegate to it.
type SSHService struct {
	prompter *HostKeyPrompter
	repo     *store.ServerRepo
	secret   secret.Store
	dialer   Dialer
	mgr      *term.Manager
}

// NewSSHService wires the service to the shared host-key prompter, the
// repository, the keychain, the dialer and the terminal manager.
func NewSSHService(p *HostKeyPrompter, repo *store.ServerRepo, sec secret.Store, dialer Dialer, mgr *term.Manager) *SSHService {
	return &SSHService{prompter: p, repo: repo, secret: sec, dialer: dialer, mgr: mgr}
}

// ConfirmHostKey delivers the user's decision for a pending host-key prompt.
// The blocking Test/Open dial is waiting on this.
func (s *SSHService) ConfirmHostKey(requestID string, accept bool) error {
	return s.prompter.Resolve(requestID, accept)
}

// Open connects to a server and starts an interactive PTY, returning the new
// session id the frontend subscribes term:data on. It runs the full host-key
// flow (a hostkey:request may fire mid-dial, exactly as in TestConnection).
// The initial pty is 80x24; the frontend issues a Resize with real dimensions
// the moment its xterm has laid out.
//
// No ctx timeout here — the dialer owns the whole connect ceiling via its
// handshakeDeadline, deliberately longer than the network timeout so a
// legitimate host-key prompt is never killed mid-decision (same reasoning as
// TestConnection).
func (s *SSHService) Open(serverID string) (string, error) {
	srv, err := s.repo.Get(serverID)
	if err != nil {
		return "", err
	}
	creds, err := credsFor(s.secret, srv)
	if err != nil {
		return "", err // coded (auth / keychain) — dialer never called
	}

	client, err := s.dialer.Dial(context.Background(), *srv, creds)
	// SEC-10: drop the plaintext secrets the instant the handshake is done.
	creds.Password, creds.Passphrase = "", ""
	if err != nil {
		return "", err // Dial already classified it
	}

	sess, err := sshx.OpenSession(client, 0, 0) // OpenSession closes client on error
	if err != nil {
		return "", domain.NewError(domain.CodeConnRefused, "Connected, but the server would not open a shell.")
	}

	sessionID := uuid.NewString()
	s.mgr.Add(sessionID, sess)
	// FR-04.5: a real Open (not a test) records usage. Best-effort — a bump
	// failure must not fail an otherwise-good session; the next open self-heals.
	_ = s.repo.BumpUsage(serverID)
	return sessionID, nil
}

// Write sends base64-encoded input to a session's shell.
func (s *SSHService) Write(sessionID, dataB64 string) error {
	return s.mgr.Write(sessionID, dataB64)
}

// Resize forwards the terminal's new (cols, rows) to the remote pty.
func (s *SSHService) Resize(sessionID string, cols, rows int) error {
	return s.mgr.Resize(sessionID, cols, rows)
}

// Close ends a session at the user's request (closing a pane/tab).
func (s *SSHService) Close(sessionID string) error {
	return s.mgr.Close(sessionID)
}
