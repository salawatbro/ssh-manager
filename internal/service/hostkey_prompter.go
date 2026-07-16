package service

import (
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// Emitter is the slice of the Wails app the prompter needs. Narrowing it to
// this interface keeps the prompter unit-testable with a fake.
type Emitter interface {
	Emit(name string, data ...any) bool
}

// HostKeyPrompter turns a blocking sshx host-key prompt into an event to
// the frontend plus a channel it answers via Resolve (ConfirmHostKey).
type HostKeyPrompter struct {
	emitter Emitter
	timeout time.Duration
	mu      sync.Mutex
	pending map[string]chan bool
}

// NewHostKeyPrompter wires the prompter to the app's event emitter.
func NewHostKeyPrompter(e Emitter) *HostKeyPrompter {
	return &HostKeyPrompter{emitter: e, timeout: 60 * time.Second, pending: map[string]chan bool{}}
}

// Prompt implements sshx.HostKeyPrompter. It emits hostkey:request and
// blocks until Resolve answers or the timeout fires. It runs on the dial
// goroutine; Emit is goroutine-safe.
func (p *HostKeyPrompter) Prompt(req sshx.HostKeyRequest) (bool, error) {
	ch := make(chan bool, 1)
	p.mu.Lock()
	p.pending[req.RequestID] = ch
	p.mu.Unlock()
	defer func() {
		p.mu.Lock()
		delete(p.pending, req.RequestID)
		p.mu.Unlock()
	}()

	p.emitter.Emit("hostkey:request", HostKeyRequest(req))

	select {
	case accept := <-ch:
		return accept, nil
	case <-time.After(p.timeout):
		return false, domain.NewError(domain.CodeHostKeyRejected,
			"Host key confirmation timed out. Connection cancelled.")
	}
}

// Resolve delivers the user's verdict for requestID (called by
// SSHService.ConfirmHostKey). An unknown id means the prompt already timed
// out or was answered — a stale click.
//
// The lookup and delete happen together under the lock so only the FIRST
// caller for a given requestID ever finds the entry — a second, concurrent
// Resolve for the same id (a double-click racing itself, say) gets the "no
// pending request" error immediately instead of blocking on a send to a
// channel nothing will ever receive from again (Prompt's own deferred
// delete runs after it has already read the first value off ch). Prompt's
// defer stays in place as the timeout-path cleanup; deleting an
// already-absent key there is a no-op.
func (p *HostKeyPrompter) Resolve(requestID string, accept bool) error {
	p.mu.Lock()
	ch, ok := p.pending[requestID]
	if ok {
		delete(p.pending, requestID)
	}
	p.mu.Unlock()
	if !ok {
		return domain.NewError(domain.CodeValidation, "No pending host key request for that id.")
	}
	ch <- accept
	return nil
}
