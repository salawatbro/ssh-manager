package service

import (
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// CodePrompter turns a blocking sshx keyboard-interactive code prompt (a
// TOTP verification code, or any other question the auto-fill in
// buildKIChallenge could not answer on its own) into an event to the
// frontend plus a channel it answers via Resolve (SSHService.SubmitCode).
// Mirrors HostKeyPrompter exactly, with chan string instead of chan bool —
// the answer here is the user's typed code, not a yes/no verdict.
type CodePrompter struct {
	emitter Emitter
	timeout time.Duration
	mu      sync.Mutex
	pending map[string]chan string
}

// NewCodePrompter wires the prompter to the app's event emitter. Same 60s
// timeout as HostKeyPrompter — it must clear the dial's overall handshake
// ceiling (75s in main.go) with margin, exactly like the host-key prompt.
func NewCodePrompter(e Emitter) *CodePrompter {
	return &CodePrompter{emitter: e, timeout: 60 * time.Second, pending: map[string]chan string{}}
}

// Prompt implements sshx.CodePrompter. It emits code:request and blocks
// until Resolve answers or the timeout fires. It runs on the dial
// goroutine; Emit is goroutine-safe.
func (p *CodePrompter) Prompt(req sshx.CodeRequest) (string, error) {
	ch := make(chan string, 1)
	p.mu.Lock()
	p.pending[req.RequestID] = ch
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		delete(p.pending, req.RequestID)
		p.mu.Unlock()
	}()

	p.emitter.Emit("code:request", CodeRequest(req))

	select {
	case code := <-ch:
		return code, nil
	case <-time.After(p.timeout):
		return "", domain.NewError(domain.CodeAuthFailed,
			"Verification code entry timed out. Connection cancelled.")
	}
}

// Resolve delivers the user's typed code for requestID (called by
// SSHService.SubmitCode). An unknown id means the prompt already timed out
// or was answered — a stale submit.
//
// Mirrors HostKeyPrompter.Resolve: the lookup and delete happen together
// under the lock so only the FIRST caller for a given requestID ever finds
// the entry — a second, concurrent Resolve for the same id gets the "no
// pending request" error immediately instead of blocking on a send to a
// channel nothing will ever receive from again. Prompt's own deferred
// delete stays in place as the timeout-path cleanup; deleting an
// already-absent key there is a no-op.
func (p *CodePrompter) Resolve(requestID, code string) error {
	p.mu.Lock()
	ch, ok := p.pending[requestID]
	if ok {
		delete(p.pending, requestID)
	}
	p.mu.Unlock()
	if !ok {
		return domain.NewError(domain.CodeValidation, "No pending code request for that id.")
	}
	ch <- code
	return nil
}

var _ sshx.CodePrompter = (*CodePrompter)(nil)
