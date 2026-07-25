package service

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/localpty"
	"github.com/salawat/sshmgr/internal/term"
)

// LocalService opens terminal sessions on the LOCAL machine — the app as a
// plain terminal, with no server, no keychain and no host-key flow.
//
// It owns Open only, on purpose: the session is registered in the same
// term.Manager as every SSH session, so SSHService.Write / Resize / Close
// already drive it by session id. That is deliberate reuse, not an oversight —
// do not "fix" it by duplicating those three wrappers here.
type LocalService struct {
	mgr *term.Manager
}

// NewLocalService wires the service to the shared terminal manager.
func NewLocalService(mgr *term.Manager) *LocalService {
	return &LocalService{mgr: mgr}
}

// Open starts a login shell on a local pty at cols x rows and returns the
// session id the frontend subscribes term:data on, plus the shell's name (the
// frontend picks a shell-integration snippet from it, exactly as it does for
// the probed remote shell). No probe is needed — we launched the shell.
func (s *LocalService) Open(cols, rows int) (OpenResult, error) {
	sess, err := localpty.Open(cols, rows)
	if err != nil {
		// Nothing under internal/ logs anywhere, and the frontend's only
		// channel for this failure is the error message rendered inline with
		// a Retry button — so the cause (e.g. "$SHELL" pointing at a missing
		// binary, or ErrUnsupported on Windows) must travel in the message
		// itself or it is lost for good.
		return OpenResult{}, domain.NewError(domain.CodeConnRefused, fmt.Sprintf("Could not start a local shell: %v", err))
	}
	sessionID := uuid.NewString()
	s.mgr.Add(sessionID, sess)
	return OpenResult{SessionID: sessionID, Shell: sess.Shell()}, nil
}
