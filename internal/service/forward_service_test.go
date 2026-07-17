package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// fakeTunnelManager records calls instead of touching real listeners or SSH
// connections — Start/Stop's orchestration is this package's concern; the
// real accept-loop/teardown machinery is covered exhaustively in
// internal/forward.
type fakeTunnelManager struct {
	startFwd  domain.PortForward
	startConn *sshx.Conn
	startErr  error
	started   bool

	stoppedID string
	stopErr   error

	running []forward.Status

	// statusState is what Status(id) reports — used to drive the
	// already-running guard in Start.
	statusState forward.State
}

func (m *fakeTunnelManager) Start(fwd domain.PortForward, conn *sshx.Conn) error {
	m.started = true
	m.startFwd = fwd
	m.startConn = conn
	return m.startErr
}

func (m *fakeTunnelManager) Stop(id string) error {
	m.stoppedID = id
	return m.stopErr
}

func (m *fakeTunnelManager) Running() []forward.Status { return m.running }

func (m *fakeTunnelManager) Status(id string) forward.Status {
	return forward.Status{ForwardID: id, State: m.statusState}
}

// newForwardService wires a ForwardService over a real, shared database (so
// the server and forward tables share the foreign key) with a fake secret
// store, dialer and tunnel manager. It returns the service plus the repos
// and doubles so tests can seed servers and assert on what the doubles saw.
func newForwardService(t *testing.T, dial Dialer, mgr tunnelManager) (*ForwardService, *store.ForwardRepo, *store.ServerRepo) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	forwards := store.NewForwardRepo(db)
	servers := store.NewServerRepo(db)
	svc := NewForwardService(forwards, servers, secret.NewFake(), dial, mgr)
	return svc, forwards, servers
}

func validForwardInput(serverID string) ForwardInput {
	return ForwardInput{
		ServerID: serverID,
		Name:     "app-8080",
		Type:     domain.ForwardLocal,
		BindAddr: "127.0.0.1",
		BindPort: 8080,
		DestHost: "10.0.1.5",
		DestPort: 80,
	}
}

// SEC-08: the frontend already validated; the service validates again, and a
// bad input must not reach the database at all.
func TestForwardCreateRejectsInvalidInput(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	in := validForwardInput(srv.ID)
	in.BindPort = 0 // out of range

	_, err := svc.Create(in)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Create error = %v, want ERR_VALIDATION", err)
	}

	list, lerr := svc.List(srv.ID)
	if lerr != nil {
		t.Fatalf("List error = %v", lerr)
	}
	if len(list) != 0 {
		t.Fatalf("List() = %d forwards, want 0 (nothing should be persisted)", len(list))
	}
}

func TestForwardCreatePersistsWithUUID(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	got, err := svc.Create(validForwardInput(srv.ID))
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if got.ID == "" {
		t.Error("Create did not assign an ID")
	}
	if got.ServerID != srv.ID {
		t.Errorf("ServerID = %q, want %q", got.ServerID, srv.ID)
	}

	list, err := svc.List(srv.ID)
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 1 || list[0].ID != got.ID {
		t.Fatalf("List() = %+v, want it to contain the created forward", list)
	}
}

func TestForwardListReturnsAServersForwards(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	a := mkServer(t, servers, "a", nil)
	b := mkServer(t, servers, "b", nil)

	fa, err := svc.Create(validForwardInput(a.ID))
	if err != nil {
		t.Fatalf("Create(a) error = %v", err)
	}
	inB := validForwardInput(b.ID)
	inB.Name = "app-9090"
	inB.BindPort = 9090
	if _, err := svc.Create(inB); err != nil {
		t.Fatalf("Create(b) error = %v", err)
	}

	list, err := svc.List(a.ID)
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 1 || list[0].ID != fa.ID {
		t.Fatalf("List(a) = %+v, want exactly the one forward on a", list)
	}
}

func TestForwardStartUnknownIDReturnsErrNotFound(t *testing.T) {
	svc, _, _ := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	if err := svc.Start("ghost"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Start error = %v, want domain.ErrNotFound", err)
	}
}

// Start must resolve the full jump chain before dialing — proven here by a
// forward on a server whose jump chain is a cycle. The cycle error comes
// from resolveChain, before the dialer or the tunnel manager are ever
// touched, so neither double should record any activity.
func TestForwardStartPropagatesChainError(t *testing.T) {
	dial := &fakeDialer{}
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, dial, mgr)

	mkServer(t, servers, "b", nil)
	a := mkServer(t, servers, "a", strptr("b"))
	// Close the loop: b -> a, same technique as TestResolveChainCycle.
	b, err := servers.Get("b")
	if err != nil {
		t.Fatal(err)
	}
	b.JumpID = strptr("a")
	if err := servers.Update(b); err != nil {
		t.Fatal(err)
	}

	fwd := &domain.PortForward{
		ID: "f1", ServerID: a.ID, Name: "app", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: 8080, DestHost: "10.0.1.5", DestPort: 80,
	}
	if err := forwards.Create(fwd); err != nil {
		t.Fatalf("Create(fwd) error = %v", err)
	}

	err = svc.Start(fwd.ID)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeJumpCycle {
		t.Fatalf("Start error = %v, want ERR_JUMP_CYCLE", err)
	}
	if dial.dialed {
		t.Error("dialer was called despite a cycle in the jump chain")
	}
	if mgr.started {
		t.Error("tunnel manager was started despite a cycle in the jump chain")
	}
}

// Start's success path: resolve the (jumpless) chain, dial it, and hand the
// resulting conn to the manager along with the forward it loaded.
func TestForwardStartSuccessPathCallsManager(t *testing.T) {
	canned := &sshx.Conn{}
	dial := &fakeDialer{}
	dialConn := canned
	// fakeDialer.DialChain always returns (nil, dialErr); wrap it so this
	// test can hand back a real, non-nil *sshx.Conn instead.
	dialer := &connReturningDialer{fakeDialer: dial, conn: dialConn}
	mgr := &fakeTunnelManager{}
	svc, forwards, servers := newForwardService(t, dialer, mgr)

	srv := mkServer(t, servers, "s1", nil)
	fwd := &domain.PortForward{
		ID: "f1", ServerID: srv.ID, Name: "app", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: 8080, DestHost: "10.0.1.5", DestPort: 80,
	}
	if err := forwards.Create(fwd); err != nil {
		t.Fatalf("Create(fwd) error = %v", err)
	}

	if err := svc.Start(fwd.ID); err != nil {
		t.Fatalf("Start error = %v", err)
	}
	if !mgr.started {
		t.Fatal("tunnel manager was never started")
	}
	if mgr.startFwd.ID != fwd.ID {
		t.Errorf("mgr.Start received forward %q, want %q", mgr.startFwd.ID, fwd.ID)
	}
	if mgr.startConn != canned {
		t.Error("mgr.Start did not receive the dialer's conn")
	}
}

// connReturningDialer wraps fakeDialer so DialChain can hand back a real,
// non-nil *sshx.Conn (fakeDialer's own DialChain always returns nil) while
// still routing Test/Dial through the embedded fake.
type connReturningDialer struct {
	*fakeDialer
	conn *sshx.Conn
}

func (d *connReturningDialer) DialChain(_ context.Context, chain []sshx.Hop) (*sshx.Conn, error) {
	if len(chain) > 0 {
		d.seen = chain[len(chain)-1].Creds
	}
	d.dialed = true
	return d.conn, d.dialErr
}

// Deleting a forward must stop its tunnel first, or the live tunnel is orphaned
// (keeps forwarding with no row left to stop it from).
func TestForwardDeleteStopsTunnel(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, _, servers := newForwardService(t, &fakeDialer{}, mgr)
	srv := mkServer(t, servers, "s1", nil)

	created, err := svc.Create(validForwardInput(srv.ID))
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("Delete error = %v", err)
	}
	if mgr.stoppedID != created.ID {
		t.Errorf("Delete stopped tunnel %q, want %q", mgr.stoppedID, created.ID)
	}
	list, _ := svc.List(srv.ID)
	if len(list) != 0 {
		t.Fatalf("List() = %d after Delete, want 0", len(list))
	}
}

func TestForwardStopCallsManager(t *testing.T) {
	mgr := &fakeTunnelManager{}
	svc, _, _ := newForwardService(t, &fakeDialer{}, mgr)

	if err := svc.Stop("f1"); err != nil {
		t.Fatalf("Stop error = %v", err)
	}
	if mgr.stoppedID != "f1" {
		t.Errorf("mgr.Stop received id %q, want %q", mgr.stoppedID, "f1")
	}
}

func TestForwardStatusesReturnsManagerRunning(t *testing.T) {
	mgr := &fakeTunnelManager{running: []forward.Status{{ForwardID: "f1", State: forward.StateRunning}}}
	svc, _, _ := newForwardService(t, &fakeDialer{}, mgr)

	got := svc.Statuses()
	if len(got) != 1 || got[0].ForwardID != "f1" {
		t.Fatalf("Statuses() = %+v, want the manager's running list", got)
	}
}

// Update overwrites the editable fields and reads the row back.
func TestForwardUpdateChangesEditableFields(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	created, err := svc.Create(validForwardInput(srv.ID))
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := validForwardInput(srv.ID)
	in.ID = created.ID
	in.Name = "renamed"
	in.BindPort = 15432
	in.DestPort = 5432
	got, err := svc.Update(in)
	if err != nil {
		t.Fatalf("Update error = %v", err)
	}
	if got.Name != "renamed" || got.BindPort != 15432 || got.DestPort != 5432 {
		t.Fatalf("Update = %+v, want name/ports changed", got)
	}
}

// SEC-07 boundary: Update must NOT be able to rehome a forward onto a different
// (or bogus) server — ForwardRepo.Update's column Select excludes server_id.
func TestForwardUpdateCannotCorruptServerID(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	created, err := svc.Create(validForwardInput(srv.ID))
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := validForwardInput(srv.ID)
	in.ID = created.ID
	in.ServerID = "bogus" // attempt to rehome
	got, err := svc.Update(in)
	if err != nil {
		t.Fatalf("Update error = %v", err)
	}
	if got.ServerID != srv.ID {
		t.Fatalf("ServerID = %q after Update, want it unchanged at %q", got.ServerID, srv.ID)
	}
}

func TestForwardUpdateUnknownIDReturnsErrNotFound(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	in := validForwardInput(srv.ID)
	in.ID = "ghost"
	if _, err := svc.Update(in); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update(unknown) error = %v, want domain.ErrNotFound", err)
	}
}

func TestForwardUpdateRejectsInvalidInput(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	created, err := svc.Create(validForwardInput(srv.ID))
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := validForwardInput(srv.ID)
	in.ID = created.ID
	in.Type = "D" // invalid
	var de *domain.Error
	if _, err := svc.Update(in); !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Update(invalid) error = %v, want ERR_VALIDATION", err)
	}
}

// A second Start on an already-running forward must be refused BEFORE any dial
// — otherwise the freshly-dialed connection would leak, since Manager.Start's
// already-running branch never takes ownership of it.
func TestForwardStartAlreadyRunningDoesNotDial(t *testing.T) {
	dial := &fakeDialer{}
	mgr := &fakeTunnelManager{statusState: forward.StateRunning}
	svc, forwards, servers := newForwardService(t, dial, mgr)

	srv := mkServer(t, servers, "s1", nil)
	fwd := &domain.PortForward{
		ID: "f1", ServerID: srv.ID, Name: "app", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: 8080, DestHost: "10.0.1.5", DestPort: 80,
	}
	if err := forwards.Create(fwd); err != nil {
		t.Fatalf("Create(fwd) error = %v", err)
	}

	err := svc.Start(fwd.ID)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Start(already-running) error = %v, want ERR_VALIDATION", err)
	}
	if dial.dialed {
		t.Error("dialer was called for an already-running forward (would leak the conn)")
	}
	if mgr.started {
		t.Error("manager.Start was called for an already-running forward")
	}
}
