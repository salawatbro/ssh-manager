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

// OpenResult is what both SSHService.Open and LocalService.Open hand the
// frontend. Shell is the detected login shell ("bash"/"zsh"/"fish"), or "" when
// it could not be classified — the frontend maps that to "inject nothing" and
// reports it honestly in the status bar.
type OpenResult struct {
	SessionID string `json:"sessionID"`
	Shell     string `json:"shell"`
}

// SSHService is bound to the frontend. It owns host-key confirmation (v0.2)
// and, from v0.3, the terminal session lifecycle: Open dials + starts a PTY +
// registers it with the term.Manager; Write/Resize/Close delegate to it.
//
// Write/Resize/Close are keyed purely by session id in the shared
// term.Manager, so they also drive sessions opened by LocalService.Open —
// not just ones opened by SSHService.Open. Anything added here that assumes
// a server-scoped session (e.g. looking up a Server row by session id) would
// break local panes.
type SSHService struct {
	prompter     *HostKeyPrompter
	repo         *store.ServerRepo
	settings     *store.SettingsRepo
	secret       secret.Store
	dialer       Dialer
	mgr          *term.Manager
	codePrompter *CodePrompter
}

// NewSSHService wires the service to the shared host-key prompter, the
// repository, the settings repo (gates the shell-integration probe in Open —
// a nil settings repo means the probe never runs), the keychain, the dialer,
// the terminal manager and the shared TOTP/2FA code prompter.
func NewSSHService(p *HostKeyPrompter, repo *store.ServerRepo, settings *store.SettingsRepo, sec secret.Store, dialer Dialer, mgr *term.Manager, codePrompter *CodePrompter) *SSHService {
	return &SSHService{prompter: p, repo: repo, settings: settings, secret: sec, dialer: dialer, mgr: mgr, codePrompter: codePrompter}
}

// ConfirmHostKey delivers the user's decision for a pending host-key prompt.
// The blocking Test/Open dial is waiting on this.
func (s *SSHService) ConfirmHostKey(requestID string, accept bool) error {
	return s.prompter.Resolve(requestID, accept)
}

// SubmitCode delivers the user's typed 2FA code for a pending code:request
// (TOTP or an unrecognised keyboard-interactive question). The blocking
// Open dial — inside the keyboard-interactive challenge — is waiting on
// this.
func (s *SSHService) SubmitCode(requestID, code string) error {
	return s.codePrompter.Resolve(requestID, code)
}

// Open connects to a server and starts an interactive PTY, returning an
// OpenResult carrying the new session id the frontend subscribes term:data
// on and the detected login shell. It runs the full host-key flow (a
// hostkey:request may fire mid-dial, exactly as in TestConnection). The pty
// is opened at cols x rows — the frontend's already-fitted xterm size — so a
// long-output command scrolls correctly from the first frame instead of
// overwriting until the next resize. cols/rows under 1 (an unmeasured
// caller) fall back to a sane 80x24 inside OpenSession. The frontend still
// issues a Resize on every later container resize.
//
// No ctx timeout on the dial itself — the dialer owns the whole connect
// ceiling via its handshakeDeadline, deliberately longer than the network
// timeout so a legitimate host-key prompt is never killed mid-decision (same
// reasoning as TestConnection). That ceiling is not the whole story anymore,
// though: when the probe below runs, sshx.DetectShell adds its own
// independent ~3s timeout on top of the already-established connection, so a
// hung host can delay a successful Open by up to that long beyond the dial.
func (s *SSHService) Open(serverID string, cols, rows int) (OpenResult, error) {
	srv, err := s.repo.Get(serverID)
	if err != nil {
		return OpenResult{}, err
	}
	chain, err := resolveChain(s.repo, s.secret, srv)
	if err != nil {
		return OpenResult{}, err // coded (auth / keychain / jump cycle / jump depth)
	}

	conn, err := s.dialer.DialChain(context.Background(), chain)
	// SEC-10: drop every hop's plaintext secrets the instant dialing is done.
	zeroChainCreds(chain)
	if err != nil {
		return OpenResult{}, err // DialChain already classified it
	}

	// Probe BEFORE the PTY, and only when the user actually wants shell
	// integration — otherwise the extra round trip buys nothing. A probe
	// failure is not a connect failure (DetectShell never errors). A nil
	// settings repo (tests construct the service that way, same as the nil
	// prompter/codePrompter) reads as "off".
	shell := sshx.ShellUnknown
	if s.settings != nil {
		if cur, serr := s.settings.Get(); serr == nil && cur.ShellIntegration {
			shell = sshx.DetectShell(conn)
		}
	}

	sess, err := sshx.OpenSession(conn, cols, rows) // OpenSession closes conn (target+jumps) on error
	if err != nil {
		return OpenResult{}, domain.NewError(domain.CodeConnRefused, "Connected, but the server would not open a shell.")
	}

	sessionID := uuid.NewString()
	s.mgr.Add(sessionID, sess)
	// FR-04.5: a real Open (not a test) records usage. Best-effort — a bump
	// failure must not fail an otherwise-good session; the next open self-heals.
	_ = s.repo.BumpUsage(serverID)
	return OpenResult{SessionID: sessionID, Shell: string(shell)}, nil
}

// Write sends base64-encoded input to a session's shell.
func (s *SSHService) Write(sessionID, dataB64 string) error {
	return s.mgr.Write(sessionID, dataB64)
}

// Resize forwards the terminal's new (cols, rows) to the session's pty —
// remote (SSH) or local, whichever this session id was opened as.
func (s *SSHService) Resize(sessionID string, cols, rows int) error {
	return s.mgr.Resize(sessionID, cols, rows)
}

// Close ends a session at the user's request (closing a pane/tab).
func (s *SSHService) Close(sessionID string) error {
	return s.mgr.Close(sessionID)
}

// Broadcast writes the same base64 payload to every listed session (FR-15). It
// is best-effort: a write to a gone session doesn't stop the others; the first
// error is returned so the UI can surface a partial failure.
func (s *SSHService) Broadcast(sessionIDs []string, dataB64 string) error {
	var first error
	for _, id := range sessionIDs {
		if err := s.mgr.Write(id, dataB64); err != nil && first == nil {
			first = err
		}
	}
	return first
}
