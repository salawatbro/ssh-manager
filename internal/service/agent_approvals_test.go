package service

import (
	"context"
	"crypto/rand"
	"errors"
	"slices"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
)

func waitPending(t *testing.T, s *AgentService) *ApprovalRequest {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if r := s.PendingApproval(); r != nil {
			return r
		}
		if time.Now().After(deadline) {
			t.Fatal("no pending approval")
		}
		time.Sleep(time.Millisecond)
	}
}

type askResult struct {
	d   agent.Decision
	err error
}

func ask(ctx context.Context, s *AgentService, req agent.ConfirmRequest, opt ApprovalOptions) chan askResult {
	out := make(chan askResult, 1)
	go func() {
		d, err := AskApproval(ctx, s, req, opt)
		out <- askResult{d, err}
	}()
	return out
}

var dbRequest = agent.ConfirmRequest{
	KeyName: "deploy\u202e", Fingerprint: "SHA256:abc",
	Client:      agent.ClientInfo{Name: "ssh", App: "iTerm", Chain: []string{"ssh", "zsh", "iTerm2"}, PID: 8812},
	Host:        agent.Host{Name: "db-primary", Address: "postgres@10.20.1.30", Env: "prod", Via: []string{"bastion"}},
	Destination: "db-primary", Grantable: true,
}

func TestAskApprovalAnswered(t *testing.T) {
	f := newAgentFixture(t)
	var shown, hidden atomic.Int32
	res := ask(context.Background(), f.svc, dbRequest, ApprovalOptions{
		Default: "lock", TouchID: true,
		Show: func() bool { shown.Add(1); return true },
		Hide: func() { hidden.Add(1) },
	})
	r := waitPending(t, f.svc)
	if r.KeyName != "deploy" || r.Server != "db-primary" || r.Address != "postgres@10.20.1.30" || r.Env != "prod" ||
		!slices.Equal(r.Via, []string{"bastion"}) || r.Chain != "ssh ← zsh ← iTerm2" || r.PID != 8812 ||
		r.Length != "lock" || !r.Grantable || !r.TouchID || r.ExpiresAt.IsZero() {
		t.Fatalf("request = %+v", r)
	}
	if err := f.svc.AnswerApproval("other", true, "lock"); errCode(err) != domain.CodeNotFound {
		t.Fatalf("answer for another id = %v", err)
	}
	if err := f.svc.AnswerApproval(r.ID, true, "15m"); err != nil {
		t.Fatal(err)
	}
	got := <-res
	if got.err != nil || !got.d.Allow || got.d.Length != agent.GrantFor15Min {
		t.Fatalf("decision = %+v, %v", got.d, got.err)
	}
	if shown.Load() != 1 || hidden.Load() != 1 {
		t.Fatalf("shown %d, hidden %d", shown.Load(), hidden.Load())
	}
	if f.svc.PendingApproval() != nil {
		t.Fatal("request still pending after the answer")
	}
	f.emit.mu.Lock()
	names := append([]string(nil), f.emit.names...)
	f.emit.mu.Unlock()
	if !slices.Contains(names, "approval:request") || !slices.Contains(names, "approval:close") {
		t.Fatalf("events = %v", names)
	}
}

func TestAskApprovalNotGrantableIsOnce(t *testing.T) {
	f := newAgentFixture(t)
	req := dbRequest
	req.Grantable = false
	res := ask(context.Background(), f.svc, req, ApprovalOptions{Default: "lock", Show: func() bool { return true }})
	r := waitPending(t, f.svc)
	if r.Length != "once" || r.Grantable {
		t.Fatalf("request = %+v", r)
	}
	if err := f.svc.AnswerApproval(r.ID, true, "lock"); err != nil {
		t.Fatal(err)
	}
	if got := <-res; got.d.Length != agent.GrantOnce {
		t.Fatalf("length = %q", got.d.Length)
	}
}

func TestAskApprovalFallsBackWhenTheWindowIsNotUp(t *testing.T) {
	f := newAgentFixture(t)
	if _, err := AskApproval(context.Background(), f.svc, dbRequest, ApprovalOptions{Show: func() bool { return false }}); !errors.Is(err, ErrApprovalWindow) {
		t.Fatalf("no window = %v", err)
	}
	old := approvalAck
	approvalAck = 20 * time.Millisecond
	t.Cleanup(func() { approvalAck = old })
	hidden := false
	_, err := AskApproval(context.Background(), f.svc, dbRequest, ApprovalOptions{Show: func() bool { return true }, Hide: func() { hidden = true }})
	if !errors.Is(err, ErrApprovalWindow) || !hidden {
		t.Fatalf("window never fetched = %v, hidden %v", err, hidden)
	}
	if f.svc.PendingApproval() != nil {
		t.Fatal("a fallen-back request stayed pending")
	}
}

func TestAskApprovalTimesOut(t *testing.T) {
	f := newAgentFixture(t)
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	res := ask(ctx, f.svc, dbRequest, ApprovalOptions{Show: func() bool { return true }})
	waitPending(t, f.svc)
	if got := <-res; !errors.Is(got.err, context.DeadlineExceeded) || got.d.Allow {
		t.Fatalf("timeout = %+v, %v", got.d, got.err)
	}
}

func TestApprovalViewInProcess(t *testing.T) {
	v := approvalView(agent.ConfirmRequest{KeyName: "k", Client: agent.ClientInfo{InProcess: true, Purpose: "tunnel", PID: 7}}, "15m", false, time.Now())
	if v.Client != "Zish" || v.App != "Zish" || v.Chain != "tunnel" || v.PID != 0 || v.Length != "once" {
		t.Fatalf("view = %+v", v)
	}
}

type fixedConfirmer struct {
	d agent.Decision
	n atomic.Int32
}

func (c *fixedConfirmer) Confirm(context.Context, agent.ConfirmRequest) (agent.Decision, error) {
	c.n.Add(1)
	return c.d, nil
}

func TestGrantsThroughTheService(t *testing.T) {
	f := newAgentFixture(t)
	conf := &fixedConfirmer{d: agent.Decision{Allow: true, Length: agent.GrantUntilLock}}
	core := agent.NewCore(NewAgentKeySource(f.keys, f.sec), conf, nil, NewSignLogger(f.log, f.emit), nil)
	SetAgentDeps(f.svc, AgentDeps{Core: core, Listener: f.lis, SocketPath: fixtureSock, Emitter: f.emit})
	k, err := f.svc.Generate(GenerateKeyInput{Name: "deploy", Type: agent.KindEd25519, RequireConfirm: true})
	if err != nil {
		t.Fatal(err)
	}
	signer, err := core.Signer(k.ID, agent.ClientInfo{Purpose: "tunnel", Target: agent.Host{Name: "db", Env: "dev"}})
	if err != nil {
		t.Fatal(err)
	}
	signTwice := func() {
		for i := 0; i < 2; i++ {
			if _, err := signer.Sign(rand.Reader, []byte("d")); err != nil {
				t.Fatal(err)
			}
		}
	}
	signTwice()
	grants := f.svc.Grants()
	if len(grants) != 1 || grants[0].KeyName != "deploy" || conf.n.Load() != 1 {
		t.Fatalf("grants = %+v after %d prompts", grants, conf.n.Load())
	}
	f.emit.mu.Lock()
	_, pushed := f.emit.last["agent:grants"]
	f.emit.mu.Unlock()
	if !pushed {
		t.Fatal("agent:grants was not emitted")
	}
	if err := f.svc.RevokeGrant(grants[0].ID); err != nil || len(f.svc.Grants()) != 0 {
		t.Fatalf("revoke = %v, left %d", err, len(f.svc.Grants()))
	}
	if err := f.svc.RevokeGrant(grants[0].ID); err != nil {
		t.Fatalf("revoking a closed approval = %v", err)
	}

	signTwice()
	if _, err := f.svc.SetRequireConfirm(k.ID, true); err != nil {
		t.Fatal(err)
	}
	if len(f.svc.Grants()) != 0 {
		t.Fatal("switching the key's Touch ID kept its approval")
	}
}

type hostsMatch map[string]bool

func (m hostsMatch) Matches(hostport string, _ ssh.PublicKey) bool { return m[hostport] }

func TestHostResolverPrefersProdAndWalksJumps(t *testing.T) {
	f := newAgentFixture(t)
	key := "key-1"
	jump := "bastion-id"
	for _, s := range []domain.Server{
		{ID: jump, Name: "bastion", Host: "10.0.0.9", Port: 22, User: "ops", AuthType: domain.AuthAgent, Environment: domain.EnvNone},
		{ID: "dev", Name: "db-dev", Host: "10.0.0.1", Port: 22, User: "dev", AuthType: domain.AuthAgent, Environment: domain.EnvDev},
		{ID: "prod", Name: "db-primary", Host: "10.0.0.1", Port: 2222, User: "postgres", AuthType: domain.AuthZishKey, AgentKeyID: &key, JumpID: &jump, Environment: domain.EnvProd},
	} {
		if err := f.servers.Create(&s); err != nil {
			t.Fatal(err)
		}
	}
	r := NewHostResolver(f.servers, hostsMatch{"10.0.0.1:22": true, "10.0.0.1:2222": true})
	h := r.Resolve(nil)
	if h.Name != "db-primary" || h.Env != "prod" || h.Address != "postgres@10.0.0.1:2222" || !slices.Equal(h.Via, []string{"bastion"}) {
		t.Fatalf("host = %+v", h)
	}
	if !r.KeyOnProd(key) || r.KeyOnProd("other") {
		t.Fatal("KeyOnProd")
	}
	if h := NewHostResolver(f.servers, hostsMatch{}).Resolve(nil); h.Name != "" {
		t.Fatalf("unknown host = %+v", h)
	}
}

func TestApprovalViewStackLaunch(t *testing.T) {
	req := agent.ConfirmRequest{KeyName: "deploy, ops", Client: agent.ClientInfo{InProcess: true, Purpose: "stack launch"},
		Launch: &agent.LaunchPrompt{Stack: "Deploy\napi", Keys: []string{"deploy", "ops"}, Tunnels: []string{"postgres"},
			Servers: []agent.Host{{Name: "api-prod", Env: "prod"}, {Name: "bastion", Env: "dev"}}}}
	v := approvalView(req, "15m", true, time.Now())
	if v.Stack != agent.Label("Deploy\napi") || v.KeyName != "deploy, ops" || len(v.StackServers) != 2 ||
		v.StackServers[0] != (ApprovalHost{Name: "api-prod", Env: "prod"}) || len(v.StackTunnels) != 1 || v.Length != "once" {
		t.Fatalf("view = %+v", v)
	}
}
