package service

import (
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

type stackFixture struct {
	svc      *StackService
	servers  *store.ServerRepo
	forwards *store.ForwardRepo
	stacks   *store.StackRepo
	run      *fakeStackRunner
	changes  int
}

func newStackFixture(t *testing.T) *stackFixture {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatal(err)
	}
	f := &stackFixture{
		servers: store.NewServerRepo(db), forwards: store.NewForwardRepo(db), stacks: store.NewStackRepo(db),
		run: &fakeStackRunner{started: map[string]bool{}},
	}
	f.svc = NewStackService(f.stacks, f.servers, f.forwards)
	f.svc.run = f.run
	SetOnStacksChanged(f.svc, func() { f.changes++ })
	key := "key-deploy"
	bastion := &domain.Server{ID: "bastion", Name: "bastion", Host: "10.0.0.1", User: "ops", Port: 22,
		AuthType: domain.AuthZishKey, AgentKeyID: &key, Environment: domain.EnvProd}
	jump := "bastion"
	db1 := &domain.Server{ID: "db", Name: "db-primary", Host: "10.0.0.2", User: "postgres", Port: 22,
		AuthType: domain.AuthAgent, JumpID: &jump, Environment: domain.EnvProd}
	api := &domain.Server{ID: "api", Name: "api-prod", Host: "10.0.0.3", User: "deploy", Port: 22,
		AuthType: domain.AuthAgent, Environment: domain.EnvProd}
	for _, s := range []*domain.Server{bastion, db1, api} {
		if err := f.servers.Create(s); err != nil {
			t.Fatal(err)
		}
	}
	for _, fw := range []*domain.PortForward{
		{ID: "pg", ServerID: "db", Name: "postgres", Type: domain.ForwardLocal, BindAddr: "127.0.0.1", BindPort: 5432, DestHost: "localhost", DestPort: 5432},
		{ID: "redis", ServerID: "api", Name: "redis", Type: domain.ForwardLocal, BindAddr: "127.0.0.1", BindPort: 6379, DestHost: "localhost", DestPort: 6379},
	} {
		if err := f.forwards.Create(fw); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

// deployInput is the board's "Deploy api" stack, steps deliberately not in
// launch order: the tunnel comes second.
func deployInput() StackInput {
	return StackInput{
		Name: "Deploy api", Description: "api-prod and the database side by side", Icon: "rocket",
		Shortcut: "cmd+alt+1", InMenuBar: true, OneApproval: true,
		Steps: []StackStepInput{
			{Kind: domain.StepServer, ServerID: "api", Placement: domain.PlaceTab, RunCommand: "tmux new -A -s deploy"},
			{Kind: domain.StepTunnel, ForwardID: "pg"},
			{Kind: domain.StepServer, ServerID: "db", Placement: domain.PlaceSplit, RunCommand: "sudo -iu postgres psql"},
			{Kind: domain.StepServer, ServerID: "bastion", Placement: domain.PlaceTab},
		},
	}
}

type fakeScope struct {
	active   bool
	attached []int
	closed   bool
}

func (s *fakeScope) Active() bool   { return s.active }
func (s *fakeScope) Attach(pid int) { s.attached = append(s.attached, pid) }
func (s *fakeScope) Close()         { s.closed = true }

type fakeStackRunner struct {
	isLocked   bool
	calls      []string
	requests   []agent.LaunchRequest
	scope      *fakeScope
	approveErr error
	started    map[string]bool
	tunnelErr  map[string]error
	openErr    map[string]error
	opens      []stepOpen
}

func (r *fakeStackRunner) locked() bool { return r.isLocked }

func (r *fakeStackRunner) approve(req agent.LaunchRequest) (launchScope, error) {
	r.calls = append(r.calls, "approve")
	r.requests = append(r.requests, req)
	if r.approveErr != nil {
		return nil, r.approveErr
	}
	if r.scope == nil {
		r.scope = &fakeScope{active: true}
	}
	return r.scope, nil
}

func (r *fakeStackRunner) startTunnel(id string) (bool, error) {
	r.calls = append(r.calls, "tunnel "+id)
	if err := r.tunnelErr[id]; err != nil {
		return false, err
	}
	if r.started[id] {
		return false, nil
	}
	r.started[id] = true
	return true, nil
}

func (r *fakeStackRunner) openServer(id string, o stepOpen) (string, error) {
	r.calls = append(r.calls, "open "+id)
	if err := r.openErr[id]; err != nil {
		return "", err
	}
	r.opens = append(r.opens, o)
	o.onRedeem(100 + len(r.opens))
	if o.placement == domain.PlaceSplit {
		return "Allow Zish to control iTerm2.", nil
	}
	return "", nil
}

func (r *fakeStackRunner) terminalName() string { return "iTerm2" }

func TestStackCreateUpdateDelete(t *testing.T) {
	f := newStackFixture(t)
	st, err := f.svc.Create(deployInput())
	if err != nil {
		t.Fatalf("Create = %v", err)
	}
	if st.Shortcut != "alt+cmd+1" || len(st.Steps) != 4 || !st.OneApproval || f.changes != 1 {
		t.Fatalf("created = %+v, changes %d", st, f.changes)
	}

	in := deployInput()
	in.Name, in.Shortcut, in.Steps = "Renamed", "", in.Steps[:1]
	upd, err := f.svc.Update(st.ID, in)
	if err != nil || upd.Name != "Renamed" || upd.Shortcut != "" || len(upd.Steps) != 1 || f.changes != 2 {
		t.Fatalf("Update = %+v, %v", upd, err)
	}
	if err := f.svc.Delete(st.ID); err != nil || f.changes != 3 {
		t.Fatalf("Delete = %v", err)
	}
	if list, _ := f.svc.List(); len(list) != 0 {
		t.Fatalf("List after delete = %d", len(list))
	}
}

func TestStackCreateRejects(t *testing.T) {
	f := newStackFixture(t)
	if _, err := f.svc.Create(deployInput()); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*StackInput){
		"missing server":   func(in *StackInput) { in.Steps[0].ServerID = "ghost" },
		"missing tunnel":   func(in *StackInput) { in.Steps[1].ForwardID = "ghost" },
		"shortcut taken":   func(in *StackInput) { in.Name = "Other" },
		"invalid shortcut": func(in *StackInput) { in.Shortcut = "ctrl+a" },
		"no name":          func(in *StackInput) { in.Name = "" },
	}
	for name, mut := range cases {
		in := deployInput()
		mut(&in)
		if _, err := f.svc.Create(in); err == nil || codeOf(t, err) != domain.CodeValidation {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	in := deployInput()
	in.Name = "Other"
	_, err := f.svc.Create(in)
	if err == nil || !strings.Contains(err.Error(), "⌥⌘1 already launches Deploy api") {
		t.Fatalf("taken shortcut message = %v", err)
	}
	// Saving a stack with its own shortcut is not a clash.
	list, _ := f.svc.List()
	if _, err := f.svc.Update(list[0].ID, deployInput()); err != nil {
		t.Fatalf("Update with its own shortcut = %v", err)
	}
}

// Tunnels start first, in their order; servers then open in theirs, the first
// never splitting, each step's command and placement passed through, and every
// ssh the launch starts attached to the one approval.
func TestStackLaunchOrder(t *testing.T) {
	f := newStackFixture(t)
	st, err := f.svc.Create(deployInput())
	if err != nil {
		t.Fatal(err)
	}
	res, err := f.svc.Launch(st.ID)
	if err != nil {
		t.Fatalf("Launch = %v", err)
	}
	want := []string{"approve", "tunnel pg", "open api", "open db", "open bastion"}
	if !slices.Equal(f.run.calls, want) {
		t.Fatalf("calls = %q, want %q", f.run.calls, want)
	}
	if res.Servers != 3 || res.Tunnels != 1 || !res.OneApproval || res.Terminal != "iTerm2" || res.Note != "Allow Zish to control iTerm2." {
		t.Fatalf("result = %+v", res)
	}
	o := f.run.opens
	if !o[0].first || o[1].first || o[1].placement != domain.PlaceSplit || o[0].runCommand != "tmux new -A -s deploy" || o[2].runCommand != "" {
		t.Fatalf("opens = %+v", o)
	}
	if !slices.Equal(f.run.scope.attached, []int{101, 102, 103}) || f.run.scope.closed {
		t.Fatalf("scope = %+v", f.run.scope)
	}
	req := f.run.requests[0]
	if req.Stack != "Deploy api" || !slices.Equal(req.KeyIDs, []string{"key-deploy"}) || !slices.Equal(req.Tunnels, []string{"postgres"}) {
		t.Fatalf("request = %+v", req)
	}
	if len(req.Servers) != 3 || req.Servers[0].Name != "api-prod" || req.Servers[0].Env != "prod" || req.Servers[0].Address != "deploy@10.0.0.3" {
		t.Fatalf("request servers = %+v", req.Servers)
	}
	got, _ := f.stacks.Get(st.ID)
	if got.LastLaunchedAt == nil {
		t.Fatal("Launch did not record the time")
	}

	f.run.calls = nil
	if res, err := f.svc.Launch(st.ID); err != nil || res.Tunnels != 0 || res.Servers != 3 {
		t.Fatalf("second launch = %+v, %v: a running tunnel is skipped", res, err)
	}
}

func TestStackLaunchWithoutOneApprovalAsksNothing(t *testing.T) {
	f := newStackFixture(t)
	in := deployInput()
	in.OneApproval = false
	st, _ := f.svc.Create(in)
	res, err := f.svc.Launch(st.ID)
	if err != nil || res.OneApproval || slices.Contains(f.run.calls, "approve") {
		t.Fatalf("res %+v, err %v, calls %q", res, err, f.run.calls)
	}
}

func TestStackLaunchStops(t *testing.T) {
	f := newStackFixture(t)
	st, _ := f.svc.Create(deployInput())

	f.run.tunnelErr = map[string]error{"pg": domain.NewError(domain.CodeConnRefused, "Connection refused.")}
	_, err := f.svc.Launch(st.ID)
	if codeOf(t, err) != domain.CodeConnRefused || !strings.HasPrefix(err.Error(), "postgres didn’t start") {
		t.Fatalf("tunnel failure = %v", err)
	}
	if slices.ContainsFunc(f.run.calls, func(c string) bool { return strings.HasPrefix(c, "open") }) || !f.run.scope.closed {
		t.Fatalf("calls %q, scope %+v: no server may open after a tunnel fails", f.run.calls, f.run.scope)
	}

	f.run.tunnelErr, f.run.calls, f.run.scope = nil, nil, nil
	f.run.openErr = map[string]error{"db": errors.New("osascript failed")}
	_, err = f.svc.Launch(st.ID)
	if err == nil || !strings.Contains(err.Error(), "db-primary didn’t open (1 of 3 opened)") {
		t.Fatalf("server failure = %v", err)
	}
	if f.run.scope.closed || slices.Contains(f.run.calls, "open bastion") {
		t.Fatalf("calls %q: an open ssh keeps its approval, later steps do not run", f.run.calls)
	}

	f.run.approveErr = agent.ErrLaunchDenied
	f.run.calls = nil
	if _, err := f.svc.Launch(st.ID); !errors.Is(err, agent.ErrLaunchDenied) || len(f.run.calls) != 1 {
		t.Fatalf("denied = %v, calls %q", err, f.run.calls)
	}

	f.run.isLocked = true
	if _, err := f.svc.Launch(st.ID); !errors.Is(err, ErrLauncherLocked) {
		t.Fatalf("locked = %v", err)
	}
}

func TestStackLaunchRefusals(t *testing.T) {
	f := newStackFixture(t)
	empty, _ := f.svc.Create(StackInput{Name: "Empty"})
	if _, err := f.svc.Launch(empty.ID); err == nil || codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("empty = %v", err)
	}
	if _, err := f.svc.Launch("ghost"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing = %v", err)
	}
	st, _ := f.svc.Create(deployInput())
	f.svc.begin(st.ID)
	if _, err := f.svc.Launch(st.ID); !errors.Is(err, ErrStackOpening) {
		t.Fatalf("second launch = %v", err)
	}
	f.svc.end(st.ID)
	f.svc.run = nil
	if _, err := f.svc.Launch(st.ID); !errors.Is(err, ErrLauncherBusy) {
		t.Fatalf("no runtime = %v", err)
	}
}

// A stack step reaches the terminal through the launcher: iTerm2 gets the
// split script with the placement as an argument, and the step's command
// replaces the server's own.
func TestStackStepOpensThroughTheLauncher(t *testing.T) {
	lf := newLauncherFixture(t, allApps)
	lf.setTerminal(t, func(s *domain.Settings) { s.Terminal = domain.TerminalITerm2 })
	srv := lf.add(t, domain.Server{ID: "db", Name: "db", Host: "db.internal", User: "root", AuthType: domain.AuthAgent,
		RunAfterConnect: "cd /srv", Terminal: domain.TerminalGhostty})
	var redeemed []int
	if _, err := lf.svc.open(srv.ID, stepOpen{placement: domain.PlaceSplit, runCommand: "psql", onRedeem: func(pid int) { redeemed = append(redeemed, pid) }}); err != nil {
		t.Fatal(err)
	}
	run := lf.runner.runs[0]
	if run[0] != "/usr/bin/osascript" || !strings.Contains(run[2], "split vertically") || run[4] != "split" {
		t.Fatalf("argv = %q: the stack keeps iTerm2 and splits", run)
	}
	argv := lf.redeemLast(t)
	if argv[len(argv)-1] != "psql\nexec \"$SHELL\" -l" {
		t.Fatalf("argv = %q", argv)
	}
	if len(redeemed) != 0 {
		t.Fatalf("a redeem without a peer pid reached the scope: %v", redeemed)
	}
	if _, err := lf.svc.open(srv.ID, stepOpen{placement: domain.PlaceSplit, first: true}); err != nil {
		t.Fatal(err)
	}
	if run := lf.runner.runs[1]; run[4] != "tab" {
		t.Fatalf("first step argv = %q: nothing to split yet", run)
	}
}

func TestShortcutLabel(t *testing.T) {
	for in, want := range map[string]string{"alt+cmd+1": "⌥⌘1", "ctrl+shift+cmd+k": "⌃⇧⌘K"} {
		if got := ShortcutLabel(in); got != want {
			t.Errorf("ShortcutLabel(%q) = %q", in, got)
		}
	}
}

func ExampleShortcutLabel() {
	fmt.Println(ShortcutLabel("alt+cmd+1"))
	// Output: ⌥⌘1
}
