package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
)

// ApprovalRequest is what the approval window shows: the approval:request
// event payload and PendingApproval's result.
type ApprovalRequest struct {
	ID          string    `json:"id"`
	KeyName     string    `json:"keyName"`
	Fingerprint string    `json:"fingerprint"`
	Server      string    `json:"server"`  // server name, or "host key SHA256:…"; "" if unknown
	Address     string    `json:"address"` // user@host[:port] of a Zish server
	Env         string    `json:"env"`     // "" when the server isn't in Zish
	Via         []string  `json:"via"`     // jump hosts, nearest the Mac first
	Client      string    `json:"client"`  // "ssh"
	App         string    `json:"app"`     // "iTerm"
	Chain       string    `json:"chain"`   // "ssh ← zsh ← login ← iTerm2"
	PID         int       `json:"pid"`
	InProcess   bool      `json:"inProcess"`
	Forwarded   bool      `json:"forwarded"`
	Grantable   bool      `json:"grantable"` // the window may offer longer than once
	Length      string    `json:"length"`    // the length picked first
	TouchID     bool      `json:"touchId"`   // approving runs Touch ID next
	ExpiresAt   time.Time `json:"expiresAt"`
	// Stack is set when one approval covers a whole stack launch.
	Stack        string         `json:"stack"`
	StackServers []ApprovalHost `json:"stackServers"`
	StackTunnels []string       `json:"stackTunnels"`
}

// ApprovalHost is a server a stack approval names.
type ApprovalHost struct {
	Name string `json:"name"`
	Env  string `json:"env"`
}

// approvalAck bounds how long the approval window may take to fetch a
// request before the confirmer falls back to the plain Touch ID sheet.
var approvalAck = 3 * time.Second

// ErrApprovalWindow reports that the approval window could not be used; the
// caller falls back to the plain prompt.
var ErrApprovalWindow = errors.New("approval window unavailable")

type approvalAnswer struct {
	allow  bool
	length agent.GrantLength
}

type pendingApproval struct {
	req    ApprovalRequest
	seen   chan struct{}
	once   sync.Once
	answer chan approvalAnswer
}

// approvalBroker holds the one request the window shows. The agent core
// prompts one at a time, so there is never a second.
type approvalBroker struct {
	mu  sync.Mutex
	cur *pendingApproval
}

func (b *approvalBroker) current() *pendingApproval {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.cur
}

func (b *approvalBroker) swap(old, next *pendingApproval) {
	b.mu.Lock()
	if b.cur == old {
		b.cur = next
	}
	b.mu.Unlock()
}

// ApprovalOptions are the confirmer's inputs besides the request.
type ApprovalOptions struct {
	Default string // Settings.GrantDefault
	TouchID bool   // Touch ID runs after an approve
	Show    func() bool
	Hide    func()
}

// AskApproval shows req in the approval window and waits for the answer.
// ErrApprovalWindow means the window never fetched the request (not created,
// screen locked, webview not loaded): fall back to the plain prompt.
func AskApproval(ctx context.Context, s *AgentService, req agent.ConfirmRequest, opt ApprovalOptions) (agent.Decision, error) {
	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(agent.ConfirmTimeout)
	}
	p := &pendingApproval{
		req:    approvalView(req, opt.Default, opt.TouchID, deadline),
		seen:   make(chan struct{}),
		answer: make(chan approvalAnswer, 1),
	}
	s.approvals.swap(s.approvals.current(), p)
	defer func() {
		s.approvals.swap(p, nil)
		s.emit("approval:close", p.req.ID)
	}()
	s.emit("approval:request", p.req)
	if opt.Show == nil || !opt.Show() {
		return agent.Decision{}, ErrApprovalWindow
	}
	if opt.Hide != nil {
		defer opt.Hide()
	}
	ack := time.NewTimer(approvalAck)
	defer ack.Stop()
	select {
	case <-p.seen:
	case <-ack.C:
		return agent.Decision{}, ErrApprovalWindow
	case <-ctx.Done():
		return agent.Decision{}, ctx.Err()
	}
	select {
	case a := <-p.answer:
		return agent.Decision{Allow: a.allow, Length: a.length}, nil
	case <-ctx.Done():
		return agent.Decision{}, ctx.Err()
	}
}

func approvalView(req agent.ConfirmRequest, def string, touchID bool, expires time.Time) ApprovalRequest {
	c := req.Client
	v := ApprovalRequest{
		ID: uuid.NewString(), KeyName: agent.Label(req.KeyName), Fingerprint: req.Fingerprint,
		Server: agent.Label(req.Host.Name), Address: agent.Label(req.Host.Address), Env: req.Host.Env,
		Via: labels(req.Host.Via), Client: agent.Label(c.Name), App: agent.Label(c.App),
		Chain: strings.Join(labels(c.Chain), " ← "), PID: c.PID, InProcess: c.InProcess,
		Forwarded: req.Forwarded, Grantable: req.Grantable, Length: string(agent.GrantOnce),
		TouchID: touchID, ExpiresAt: expires,
	}
	if c.InProcess {
		v.Client, v.App, v.Chain, v.PID = "Zish", "Zish", agent.Label(c.Purpose), 0
	}
	if req.Grantable {
		v.Length = string(agent.ParseGrantLength(def))
	}
	if l := req.Launch; l != nil {
		v.Stack, v.KeyName, v.StackTunnels = agent.Label(l.Stack), strings.Join(labels(l.Keys), ", "), labels(l.Tunnels)
		v.StackServers = make([]ApprovalHost, 0, len(l.Servers))
		for _, h := range l.Servers {
			v.StackServers = append(v.StackServers, ApprovalHost{Name: agent.Label(h.Name), Env: h.Env})
		}
	}
	return v
}

func labels(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		out = append(out, agent.Label(s))
	}
	return out
}

// PendingApproval returns the request the approval window should show, or
// nil. Fetching it is how the window tells the confirmer it is up.
func (s *AgentService) PendingApproval() *ApprovalRequest {
	p := s.approvals.current()
	if p == nil {
		return nil
	}
	p.once.Do(func() { close(p.seen) })
	r := p.req
	return &r
}

// AnswerApproval settles the shown request. length is "once", "15m" or
// "lock"; a request that isn't grantable is always once.
func (s *AgentService) AnswerApproval(id string, allow bool, length string) error {
	p := s.approvals.current()
	if p == nil || p.req.ID != id {
		return domain.NewError(domain.CodeNotFound, "This request is no longer waiting.")
	}
	l := agent.ParseGrantLength(length)
	if !p.req.Grantable {
		l = agent.GrantOnce
	}
	select {
	case p.answer <- approvalAnswer{allow: allow, length: l}:
	default:
	}
	return nil
}

// Grants returns the open approvals, newest first.
func (s *AgentService) Grants() []agent.Grant {
	if c := s.rt.core(); c != nil {
		return c.Grants()
	}
	return []agent.Grant{}
}

// RevokeGrant closes one approval. An approval that already closed is not an
// error.
func (s *AgentService) RevokeGrant(id string) error {
	if c := s.rt.core(); c != nil {
		c.RevokeGrant(id)
	}
	return nil
}

func (s *AgentService) emit(name string, data any) {
	if e := s.deps().Emitter; e != nil {
		e.Emit(name, data)
	}
}
