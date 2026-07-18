package service

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// fakeDialer returns a preset result/error without touching the network. It
// also satisfies the Dial half of the Dialer interface (added for
// SSHService.Open in v0.3): dialErr/dialed let ssh_service_test.go assert
// Open's orchestration without a live client, while Test's res/err/seen keep
// covering TestConnection unchanged.
type fakeDialer struct {
	res  sshx.DialResult
	err  error
	seen sshx.Credentials

	dialErr error
	dialed  bool
}

func (d *fakeDialer) Test(_ context.Context, _ domain.Server, creds sshx.Credentials) (sshx.DialResult, error) {
	d.seen = creds
	return d.res, d.err
}

// Dial always returns a nil client — Open must classify dialErr (or the
// missing-creds path) without ever touching a live *ssh.Client; that path is
// covered end-to-end in internal/sshx and by manual test.
func (d *fakeDialer) Dial(_ context.Context, _ domain.Server, creds sshx.Credentials) (*ssh.Client, error) {
	d.seen = creds
	d.dialed = true
	return nil, d.dialErr
}

// DialChain mirrors Dial: it never touches a live connection, only records
// that a chain was dialed and returns dialErr. No test in this package
// exercises SSHService.Open (that orchestration lives in
// ssh_service_test.go), so this only needs to keep fakeDialer satisfying the
// Dialer interface.
func (d *fakeDialer) DialChain(_ context.Context, chain []sshx.Hop) (*sshx.Conn, error) {
	if len(chain) > 0 {
		d.seen = chain[len(chain)-1].Creds
	}
	d.dialed = true
	return nil, d.dialErr
}

func newService(t *testing.T) *ServerService {
	t.Helper()
	svc, _ := newServiceWithRepo(t)
	return svc
}

// newServiceWithRepo also returns the underlying repo, for tests that need
// to seed state (usage history) the service itself has no way to write yet.
// It wires a no-op fake dialer — these tests exercise CRUD, not TestConnection.
func newServiceWithRepo(t *testing.T) (*ServerService, *store.ServerRepo) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	repo := store.NewServerRepo(db)
	return NewServerService(repo, secret.NewFake(), &fakeDialer{}), repo
}

// newServiceWithSecrets builds a service over a real repo, a fake keychain
// and the given (fake) dialer — so TestConnection tests can control what the
// "network" returns without an in-process SSH server (that path is already
// covered exhaustively in internal/sshx). It returns the fake keychain too,
// for tests that need to seed or inspect stored secrets.
func newServiceWithSecrets(t *testing.T, dial Dialer) (*ServerService, *secret.Fake) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	repo := store.NewServerRepo(db)
	sec := secret.NewFake()
	return NewServerService(repo, sec, dial), sec
}

// seedUsage gives id a real usage history by bumping it useCount times
// through the repo's BumpUsage — the same writer a live SSH connection
// uses — since ServerService itself has no method to record usage until
// v0.2 wires up connections. It returns the row's state right after
// seeding, including the last_used_at BumpUsage actually stamped.
//
// This used to seed by loading the row and calling repo.Update with
// LastUsedAt/UseCount/SortOrder set by hand. That stopped working the
// moment Update's updatableColumns excluded those columns (this task): the
// seed would silently no-op, and callers would appear to pass while no
// longer testing what they claimed to. BumpUsage is the only writer of
// usage state now, so seeding goes through it too.
func seedUsage(t *testing.T, repo *store.ServerRepo, id string, useCount int) *domain.Server {
	t.Helper()
	for i := 0; i < useCount; i++ {
		if err := repo.BumpUsage(id); err != nil {
			t.Fatalf("BumpUsage error = %v", err)
		}
	}
	srv, err := repo.Get(id)
	if err != nil {
		t.Fatalf("repo.Get error = %v", err)
	}
	return srv
}

func validInput() CreateServerInput {
	return CreateServerInput{
		Name:        "cbs-app-01",
		Host:        "10.0.1.20",
		Port:        2222,
		User:        "deploy",
		AuthType:    domain.AuthAgent,
		Group:       "Prod",
		Environment: domain.EnvProd,
		Tags:        []string{"web", "eu-west"},
	}
}

func TestCreateAssignsAnID(t *testing.T) {
	svc := newService(t)
	got, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if got.ID == "" {
		t.Error("Create did not assign an ID")
	}
	if got.Name != "cbs-app-01" {
		t.Errorf("Name = %q, want %q", got.Name, "cbs-app-01")
	}
}

func TestCreateDefaultsPortTo22(t *testing.T) {
	svc := newService(t)
	in := validInput()
	in.Port = 0
	got, err := svc.Create(in)
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if got.Port != 22 {
		t.Errorf("Port = %d, want 22", got.Port)
	}
}

func TestCreateDefaultsEnvironmentToNone(t *testing.T) {
	svc := newService(t)
	in := validInput()
	in.Environment = ""
	got, err := svc.Create(in)
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if got.Environment != domain.EnvNone {
		t.Errorf("Environment = %q, want %q", got.Environment, domain.EnvNone)
	}
}

func TestCreateJoinsTags(t *testing.T) {
	svc := newService(t)
	got, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if got.Tags != "web,eu-west" {
		t.Errorf("Tags = %q, want %q", got.Tags, "web,eu-west")
	}
}

// SEC-08: the frontend is not trusted; the backend validates again.
func TestCreateRejectsInvalidInput(t *testing.T) {
	svc := newService(t)
	in := validInput()
	in.Host = "not a host"

	_, err := svc.Create(in)
	if err == nil {
		t.Fatal("Create() = nil error, want a validation error")
	}
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Create error = %v, want a domain validation error", err)
	}
}

func TestUpdateChangesFields(t *testing.T) {
	svc := newService(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := validInput()
	in.Name = "renamed"
	in.Port = 22
	got, err := svc.Update(created.ID, in)
	if err != nil {
		t.Fatalf("Update error = %v", err)
	}
	if got.Name != "renamed" || got.Port != 22 {
		t.Errorf("after Update: Name=%q Port=%d, want %q and 22", got.Name, got.Port, "renamed")
	}
}

func TestUpdateMissingReturnsErrNotFound(t *testing.T) {
	svc := newService(t)
	_, err := svc.Update("ghost", validInput())
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update error = %v, want domain.ErrNotFound", err)
	}
}

// Update must not let the edit form reset a server's usage history: the
// form only ever submits CreateServerInput, which has no LastUsedAt,
// UseCount, SortOrder or CreatedAt field to send.
//
// Load-bearing seed, same reasoning as TestDuplicateResetsUsageCounters: a
// freshly created server already has zero-valued history, so without
// seeding it first the assertions below would hold even with Update's four
// carry-over lines (srv.LastUsedAt, srv.UseCount, srv.SortOrder,
// srv.CreatedAt) deleted — confirmed by mutation. The repo's
// updatableColumns already keeps the database safe by construction (it
// excludes created_at outright); this test protects the *returned* struct,
// which has no such guardrail.
// TestUpdateDoesNotOverwriteUsageHistory is the service-level companion to
// store's TestUpdateLeavesUsageColumnsAlone: a form-driven Update must not
// clobber usage state a connection bump wrote. Unlike the old version of
// this test, it does not assert SortOrder — the service has no way to set
// it (v0.1 never carried it in CreateServerInput, and nothing writes it
// after Create today), so asserting it here would test a value this layer
// never touches either way.
func TestUpdateDoesNotOverwriteUsageHistory(t *testing.T) {
	svc, repo := newServiceWithRepo(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	seeded := seedUsage(t, repo, created.ID, 7)

	in := validInput()
	in.Name = "renamed"
	got, err := svc.Update(created.ID, in)
	if err != nil {
		t.Fatalf("Update error = %v", err)
	}
	reloaded, err := svc.Get(created.ID)
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}

	for name, srv := range map[string]*domain.Server{"returned": got, "reloaded": reloaded} {
		if srv.UseCount != 7 {
			t.Errorf("%s: UseCount = %d, want 7", name, srv.UseCount)
		}
		if srv.LastUsedAt == nil || !srv.LastUsedAt.Equal(*seeded.LastUsedAt) {
			t.Errorf("%s: LastUsedAt = %v, want %v", name, srv.LastUsedAt, seeded.LastUsedAt)
		}
		if !srv.CreatedAt.Equal(seeded.CreatedAt) {
			t.Errorf("%s: CreatedAt = %v, want %v", name, srv.CreatedAt, seeded.CreatedAt)
		}
	}

	// This is the assertion that actually exercises the write path: every
	// field checked above was already in storage (via BumpUsage) before
	// Update ever ran, so it would hold even if Update never called
	// s.repo.Update at all. Name is the one field this test's Update call
	// changed, so only reloading it from the database — not the struct
	// Update handed back in memory — proves the write reached storage.
	if reloaded.Name != "renamed" {
		t.Errorf("reloaded: Name = %q, want %q", reloaded.Name, "renamed")
	}
}

// FR-01.4
func TestDuplicateAppendsCopyToTheName(t *testing.T) {
	svc := newService(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	dup, err := svc.Duplicate(created.ID)
	if err != nil {
		t.Fatalf("Duplicate error = %v", err)
	}
	if dup.Name != "cbs-app-01 copy" {
		t.Errorf("Name = %q, want %q", dup.Name, "cbs-app-01 copy")
	}
	if dup.ID == created.ID {
		t.Error("Duplicate reused the original ID")
	}
	if dup.Host != created.Host || dup.Port != created.Port {
		t.Error("Duplicate did not copy the connection details")
	}

	// The struct above is built in memory and returned regardless of
	// whether the write actually happened. Reloading it through svc.Get
	// is the assertion that fails if Duplicate never calls s.repo.Create.
	reloaded, err := svc.Get(dup.ID)
	if err != nil {
		t.Fatalf("Get(dup.ID) error = %v, want the duplicate to exist in the database", err)
	}
	if reloaded.Name != "cbs-app-01 copy" {
		t.Errorf("reloaded: Name = %q, want %q", reloaded.Name, "cbs-app-01 copy")
	}
}

// A duplicate starts unused — it has never been connected to.
//
// Load-bearing seed: a freshly created server already has UseCount == 0 and
// LastUsedAt == nil, so duplicating it immediately would satisfy the
// assertion below even with `dup.UseCount = 0` and `dup.LastUsedAt = nil`
// deleted from Duplicate — confirmed by mutation. Giving the source real
// usage history first means the reset lines are the only thing that can
// make this test pass. Do not "simplify" the seeding away.
func TestDuplicateResetsUsageCounters(t *testing.T) {
	svc, repo := newServiceWithRepo(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	seedUsage(t, repo, created.ID, 7)

	dup, err := svc.Duplicate(created.ID)
	if err != nil {
		t.Fatalf("Duplicate error = %v", err)
	}
	if dup.UseCount != 0 || dup.LastUsedAt != nil {
		t.Errorf("Duplicate carried usage over: UseCount=%d LastUsedAt=%v", dup.UseCount, dup.LastUsedAt)
	}
}

// Fix 1: Duplicate must succeed on any valid source name, however long, by
// truncating before appending " copy" rather than failing validation. The
// user never typed a name in this flow — they clicked Duplicate on a server
// whose name was already valid — so surfacing "Name must be 1 to 64
// characters" here names the wrong cause.
func TestDuplicateTruncatesALongNameSoTheCopyStillValidates(t *testing.T) {
	tests := []struct {
		name    string
		srcName string
	}{
		{"64 runes", strings.Repeat("a", 64)},
		{"60 runes", strings.Repeat("a", 60)},
		{"64 runes, multi-byte script", strings.Repeat("ы", 64)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := newService(t)
			in := validInput()
			in.Name = tt.srcName
			created, err := svc.Create(in)
			if err != nil {
				t.Fatalf("Create error = %v", err)
			}

			dup, err := svc.Duplicate(created.ID)
			if err != nil {
				t.Fatalf("Duplicate error = %v, want it to succeed on a valid %d-rune source name", err, utf8.RuneCountInString(tt.srcName))
			}
			if err := dup.Validate(); err != nil {
				t.Errorf("Duplicate produced a name that fails validation: %v (Name = %q, %d runes)", err, dup.Name, utf8.RuneCountInString(dup.Name))
			}
			if !strings.HasSuffix(dup.Name, " copy") {
				t.Errorf("Name = %q, want it to end with %q", dup.Name, " copy")
			}
		})
	}
}

func TestDuplicateMissingReturnsErrNotFound(t *testing.T) {
	svc := newService(t)
	if _, err := svc.Duplicate("ghost"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Duplicate error = %v, want domain.ErrNotFound", err)
	}
}

func TestDeleteRemovesTheServer(t *testing.T) {
	svc := newService(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("Delete error = %v", err)
	}
	if _, err := svc.Get(created.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get after Delete = %v, want domain.ErrNotFound", err)
	}
}

// A server still referenced as another server's jump host cannot be
// deleted (ON DELETE RESTRICT, enforced at the service layer with a clear
// message before the repo delete runs) — deleting it out from under a
// dependent would leave that server's JumpID dangling. An unused leaf
// server deletes normally.
func TestDeleteJumpRestrict(t *testing.T) {
	svc, repo := newServiceWithRepo(t)
	if err := repo.Create(&domain.Server{ID: "j", Name: "b", Host: "h", User: "u", Port: 22, AuthType: domain.AuthAgent}); err != nil {
		t.Fatalf("Create(j) error = %v", err)
	}
	jid := "j"
	if err := repo.Create(&domain.Server{ID: "a", Name: "a", Host: "h", User: "u", Port: 22, AuthType: domain.AuthAgent, JumpID: &jid}); err != nil {
		t.Fatalf("Create(a) error = %v", err)
	}

	err := svc.Delete("j")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("delete of in-use jump: got %v, want ERR_VALIDATION", err)
	}

	if err := svc.Delete("a"); err != nil { // leaf, deletable
		t.Fatalf("delete of leaf failed: %v", err)
	}
}

// fakeStopper records the forward ids it was asked to stop. When repo and
// serverID are set, each Stop call also captures whether the server row was
// still present in the database at that instant — the assertion that
// actually proves ordering (see TestDeleteStopsTheServersTunnelsBeforeTheRowIsGone):
// if Delete's stop loop ever ran AFTER s.repo.Delete, the row (and its
// CASCADEd forward rows) would already be gone by the time Stop runs.
type fakeStopper struct {
	repo     *store.ServerRepo
	serverID string

	stopped          []string
	rowPresentAtStop []bool
}

func (f *fakeStopper) Stop(id string) error {
	f.stopped = append(f.stopped, id)
	if f.repo != nil {
		_, err := f.repo.Get(f.serverID)
		f.rowPresentAtStop = append(f.rowPresentAtStop, err == nil)
	}
	return nil
}

// Deleting a server must stop every one of its saved forwards' live tunnels
// — their rows CASCADE away, but the forward.Manager holds the running
// runners independently of the database. The ordering matters: a stop that
// ran after the row (and CASCADE) was already gone would be tearing down a
// tunnel for a forward that, from the database's perspective, never
// existed — harmless here since Stop is idempotent on an unknown id, but it
// would mean a stop racing a real Manager could miss the runner if some
// other path (e.g. a future re-list) depended on the row still being
// present. fakeStopper.rowPresentAtStop is what proves the ordering rather
// than merely asserting both ids got stopped.
func TestDeleteStopsTheServersTunnelsBeforeTheRowIsGone(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	repo := store.NewServerRepo(db)
	forwards := store.NewForwardRepo(db)
	svc := NewServerService(repo, secret.NewFake(), &fakeDialer{})

	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	f1 := &domain.PortForward{
		ID: "f1", ServerID: created.ID, Name: "web", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: 8080, DestHost: "localhost", DestPort: 80,
	}
	f2 := &domain.PortForward{
		ID: "f2", ServerID: created.ID, Name: "db", Type: domain.ForwardLocal,
		BindAddr: "127.0.0.1", BindPort: 8081, DestHost: "localhost", DestPort: 5432,
	}
	if err := forwards.Create(f1); err != nil {
		t.Fatalf("Create(f1) error = %v", err)
	}
	if err := forwards.Create(f2); err != nil {
		t.Fatalf("Create(f2) error = %v", err)
	}

	fs := &fakeStopper{repo: repo, serverID: created.ID}
	SetForwardDeps(svc, forwards, fs)

	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("Delete error = %v", err)
	}

	if len(fs.stopped) != 2 {
		t.Fatalf("stopped = %v, want both forward ids stopped", fs.stopped)
	}
	got := map[string]bool{fs.stopped[0]: true, fs.stopped[1]: true}
	if !got["f1"] || !got["f2"] {
		t.Fatalf("stopped = %v, want {f1 f2}", fs.stopped)
	}
	for i, present := range fs.rowPresentAtStop {
		if !present {
			t.Errorf("stop #%d (%s) ran after the server row was already gone; stops must precede repo.Delete", i, fs.stopped[i])
		}
	}
}

// Delete must still work when the forward deps have never been wired in
// (the plain 3-arg NewServerService path, e.g. every other test in this
// file and main.go before Task 6) — forwards/stopper default to nil, and
// the stop loop must treat that as a no-op rather than panic on a nil
// interface or nil *store.ForwardRepo.
func TestDeleteWorksWithNilForwardDeps(t *testing.T) {
	svc := newService(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("Delete error = %v, want nil forwards/stopper deps to be a no-op", err)
	}
}

// FR-01.9
func TestSSHCommandRendersTheStoredServer(t *testing.T) {
	svc := newService(t)
	created, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	cmd, err := svc.SSHCommand(created.ID)
	if err != nil {
		t.Fatalf("SSHCommand error = %v", err)
	}
	if cmd != "ssh -p 2222 deploy@10.0.1.20" {
		t.Errorf("SSHCommand() = %q, want %q", cmd, "ssh -p 2222 deploy@10.0.1.20")
	}
}

func TestSSHCommandIncludesTheJumpHost(t *testing.T) {
	svc := newService(t)
	jump, err := svc.Create(CreateServerInput{
		Name: "bastion-01", Host: "203.0.113.7", Port: 22,
		User: "jump", AuthType: domain.AuthAgent, Environment: domain.EnvProd,
	})
	if err != nil {
		t.Fatalf("Create(jump) error = %v", err)
	}

	in := validInput()
	in.Name = "cbs-db-01"
	in.Host = "10.0.2.10"
	in.Port = 22
	in.User = "postgres"
	in.JumpID = &jump.ID
	target, err := svc.Create(in)
	if err != nil {
		t.Fatalf("Create(target) error = %v", err)
	}

	cmd, err := svc.SSHCommand(target.ID)
	if err != nil {
		t.Fatalf("SSHCommand error = %v", err)
	}
	if !strings.Contains(cmd, "-J jump@203.0.113.7") {
		t.Errorf("SSHCommand() = %q, want it to contain %q", cmd, "-J jump@203.0.113.7")
	}
}

// A dangling JumpID cannot occur through normal use (the jump_id foreign
// key is RESTRICT, and foreign_keys enforcement is on), so the jump lookup
// inside SSHCommand can only fail with a real infrastructure fault — a
// locked or corrupt database. That must surface to the caller, not be
// swallowed into a command silently missing the -J it needs. This proves
// it by corrupting the jump row directly (bypassing the service entirely,
// the only way to make repo.Get fail with something other than
// domain.ErrNotFound), which stands in for the corruption case.
func TestSSHCommandPropagatesARealJumpLookupError(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	svc := NewServerService(store.NewServerRepo(db), secret.NewFake(), &fakeDialer{})

	jump, err := svc.Create(CreateServerInput{
		Name: "bastion-01", Host: "203.0.113.7", Port: 22,
		User: "jump", AuthType: domain.AuthAgent, Environment: domain.EnvProd,
	})
	if err != nil {
		t.Fatalf("Create(jump) error = %v", err)
	}
	in := validInput()
	in.JumpID = &jump.ID
	target, err := svc.Create(in)
	if err != nil {
		t.Fatalf("Create(target) error = %v", err)
	}

	if err := db.Exec("UPDATE servers SET created_at = 'not-a-date' WHERE id = ?", jump.ID).Error; err != nil {
		t.Fatalf("corrupting the jump row: %v", err)
	}

	_, err = svc.SSHCommand(target.ID)
	if err == nil {
		t.Fatal("SSHCommand() = nil error, want the jump lookup's real error to surface")
	}
	if errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("SSHCommand error = %v, want something other than domain.ErrNotFound", err)
	}
}

// List is the sidebar's one call on every load; ordering is the repo's
// tested concern (see store.ServerRepo.List), so this only checks that
// everything created comes back.
func TestListReturnsAllServers(t *testing.T) {
	svc := newService(t)
	first, err := svc.Create(validInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	in := validInput()
	in.Name = "cbs-app-02"
	second, err := svc.Create(in)
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	got, err := svc.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("List() returned %d servers, want 2", len(got))
	}
	ids := map[string]bool{}
	for _, srv := range got {
		ids[srv.ID] = true
	}
	if !ids[first.ID] || !ids[second.ID] {
		t.Errorf("List() = %+v, want it to contain both created servers", got)
	}
}

func TestGroupsListsDistinctGroups(t *testing.T) {
	svc := newService(t)
	for _, g := range []string{"Prod", "Dev", "Prod"} {
		in := validInput()
		in.Group = g
		if _, err := svc.Create(in); err != nil {
			t.Fatalf("Create error = %v", err)
		}
	}

	groups, err := svc.Groups()
	if err != nil {
		t.Fatalf("Groups error = %v", err)
	}
	if len(groups) != 2 {
		t.Errorf("Groups() = %v, want 2 entries", groups)
	}
}

// A reachable server with a stored password: credsFor supplies it, the
// dialer succeeds, TestConnection reports OK with the latency.
//
// The brief's version of this test creates the server with a Password field
// on CreateServerInput; that field (and Create's keychain write) does not
// exist yet — it is added by Task 9, which runs AFTER this one in the plan
// (docs/superpowers/plans/2026-07-16-v0.2-keychain-connect.md). Seeding the
// fake keychain directly here tests exactly the same credsFor contract
// (TestConnection reads whatever the keychain holds for this server) without
// depending on unwritten Task 9 code.
func TestServiceTestConnectionOK(t *testing.T) {
	dial := &fakeDialer{res: sshx.DialResult{LatencyMs: 12, Banner: "SSH-2.0-Test"}}
	svc, store := newServiceWithSecrets(t, dial)
	srv, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword,
	})
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := store.SetPassword(srv.ID, "pw"); err != nil {
		t.Fatalf("SetPassword error = %v", err)
	}

	res, err := svc.TestConnection(srv.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.OK || res.Code != "" || res.LatencyMs != 12 {
		t.Fatalf("result = %+v", res)
	}
	// credsFor pulled the stored password through to the dialer.
	if dial.seen.Password != "pw" {
		t.Fatalf("dialer saw password %q", dial.seen.Password)
	}
}

// A dialer failure (e.g. auth) becomes a failed result carrying the code,
// not a thrown error — the strip renders it. See TestServiceTestConnectionOK
// for why the password is seeded directly into the fake keychain rather than
// through a Create field that Task 9 has not added yet.
func TestServiceTestConnectionFailureCarriesCode(t *testing.T) {
	dial := &fakeDialer{err: domain.NewError(domain.CodeAuthFailed, "Authentication failed.")}
	svc, store := newServiceWithSecrets(t, dial)
	srv, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword,
	})
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := store.SetPassword(srv.ID, "pw"); err != nil {
		t.Fatalf("SetPassword error = %v", err)
	}

	res, err := svc.TestConnection(srv.ID)
	if err != nil {
		t.Fatalf("should be a result, not an error: %v", err)
	}
	if res.OK || res.Code != domain.CodeAuthFailed {
		t.Fatalf("result = %+v", res)
	}
}

// A missing password for a password server never reaches the dialer — it is
// a failed result from credsFor.
func TestServiceTestConnectionMissingPassword(t *testing.T) {
	dial := &fakeDialer{}
	svc, _ := newServiceWithSecrets(t, dial)
	srv, _ := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, // no password stored
	})
	res, err := svc.TestConnection(srv.ID)
	if err != nil {
		t.Fatalf("should be a result, not an error: %v", err)
	}
	if res.OK {
		t.Fatal("expected a failed result")
	}
	if dial.seen.Password != "" {
		t.Fatal("dialer must not be called when the password is missing")
	}
}

// TestConnection on an unknown server id is a real error.
func TestServiceTestConnectionUnknownServer(t *testing.T) {
	svc, _ := newServiceWithSecrets(t, &fakeDialer{})
	if _, err := svc.TestConnection("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

// Create with a password stores it in the keychain and NOT in the server row.
func TestCreateStoresPasswordInKeychainNotDB(t *testing.T) {
	svc, store := newServiceWithSecrets(t, &fakeDialer{})
	srv, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, Password: "s3cret",
	})
	if err != nil {
		t.Fatal(err)
	}
	// The keychain has it.
	if pw, _ := store.GetPassword(srv.ID); pw != "s3cret" {
		t.Fatalf("keychain password = %q", pw)
	}
	// The stored row does not (Server has no password field — assert the
	// row round-trips with no secret anywhere in its serialisation).
	got, _ := svc.Get(srv.ID)
	blob, _ := json.Marshal(got)
	if strings.Contains(string(blob), "s3cret") {
		t.Fatal("secret leaked into the server row")
	}
}

// Delete removes the keychain entries (FR-03.4).
func TestDeleteClearsKeychain(t *testing.T) {
	svc, store := newServiceWithSecrets(t, &fakeDialer{})
	srv, _ := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, Password: "pw",
	})
	if err := svc.Delete(srv.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetPassword(srv.ID); !errors.Is(err, secret.ErrNotStored) {
		t.Fatal("keychain password survived Delete")
	}
}

// A keychain write failure on Create rolls back the DB row — no orphan
// server with no way to store its secret.
func TestCreateRollsBackWhenKeychainFails(t *testing.T) {
	svc, store := newServiceWithSecrets(t, &fakeDialer{})
	store.FailWith(domain.NewError(domain.CodeKeychain, "Cannot save to the Keychain. Check app permissions."))
	_, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, Password: "pw",
	})
	if err == nil {
		t.Fatal("expected the keychain failure to surface")
	}
	// No server should remain.
	list, _ := svc.List()
	if len(list) != 0 {
		t.Fatalf("rolled-back create left %d servers", len(list))
	}
}

// Create with TwoFactor + a TOTP secret stores the NORMALISED secret in the
// keychain under the new server's id and marks the row TwoFactor — mirrors
// how Password is handled (SEC-01: write-only, never round-trips through
// the row's own serialisation).
func TestCreateWithTwoFactorStoresTOTPSecret(t *testing.T) {
	svc, store := newServiceWithSecrets(t, &fakeDialer{})
	srv, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, Password: "pw",
		TwoFactor: true, TOTPSecret: "gezd gnbv gy3t qojq",
	})
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if !srv.TwoFactor {
		t.Fatal("srv.TwoFactor = false, want true")
	}
	got, err := store.GetTOTPSecret(srv.ID)
	if err != nil {
		t.Fatalf("GetTOTPSecret error = %v", err)
	}
	if got != "GEZDGNBVGY3TQOJQ" {
		t.Fatalf("stored TOTP secret = %q, want the normalised form", got)
	}
	// SEC-01: the secret must never leak into the row's own serialisation.
	reloaded, _ := svc.Get(srv.ID)
	blob, _ := json.Marshal(reloaded)
	if strings.Contains(string(blob), "GEZDGNBVGY3TQOJQ") || strings.Contains(strings.ToLower(string(blob)), "gezd") {
		t.Fatal("TOTP secret leaked into the server row")
	}
}

// An invalid TOTP secret is rejected with a validation error, and Create's
// existing rollback (the same one Password/Passphrase failures already
// exercise) leaves no row behind.
func TestCreateWithInvalidTOTPSecretFails(t *testing.T) {
	svc := newService(t)
	_, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, Password: "pw",
		TwoFactor: true, TOTPSecret: "not-base32!!!",
	})
	if err == nil {
		t.Fatal("Create() = nil error, want a validation error for a bad TOTP secret")
	}
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Create error = %v, want ERR_VALIDATION", err)
	}
	list, _ := svc.List()
	if len(list) != 0 {
		t.Fatalf("rolled-back create left %d servers", len(list))
	}
}

// Update with an empty TOTPSecret leaves whatever is already stored
// untouched — mirrors the Password rule (an edit that didn't touch the
// secret sends it back empty rather than clearing it).
func TestUpdateWithEmptyTOTPSecretLeavesStoredSecretUnchanged(t *testing.T) {
	svc, store := newServiceWithSecrets(t, &fakeDialer{})
	srv, err := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, Password: "pw",
		TwoFactor: true, TOTPSecret: "GEZDGNBVGY3TQOJQ",
	})
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthPassword, TwoFactor: true, // TOTPSecret left empty
	}
	if _, err := svc.Update(srv.ID, in); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := store.GetTOTPSecret(srv.ID)
	if err != nil {
		t.Fatalf("GetTOTPSecret error = %v", err)
	}
	if got != "GEZDGNBVGY3TQOJQ" {
		t.Fatalf("stored TOTP secret = %q, want unchanged", got)
	}
}

// ImportJSON must dedup against entries created EARLIER IN THE SAME FILE, not
// only against what was already in the database before the import started.
// Two entries sharing host/port/user is the same "duplicate" the pre-existing
// serversDuplicate check already catches against prior DB state; without
// tracking newly-created rows too, a file containing that same pair twice
// would create both instead of just the first.
func TestImportJSONDedupsWithinTheSameFile(t *testing.T) {
	svc := newService(t)

	dupe := domain.Server{
		Name: "box-a", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthAgent, Environment: domain.EnvNone,
	}
	dupeAgain := dupe
	dupeAgain.Name = "box-a-again" // same host/port/user, different name
	unique := domain.Server{
		Name: "box-b", Host: "10.0.1.21", Port: 22, User: "deploy",
		AuthType: domain.AuthAgent, Environment: domain.EnvNone,
	}

	b, err := ExportServersJSON([]domain.Server{dupe, dupeAgain, unique})
	if err != nil {
		t.Fatalf("ExportServersJSON error = %v", err)
	}
	path := filepath.Join(t.TempDir(), "import.json")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatalf("WriteFile error = %v", err)
	}

	count, err := svc.ImportJSON(path)
	if err != nil {
		t.Fatalf("ImportJSON error = %v", err)
	}
	if count != 2 {
		t.Fatalf("ImportJSON() = %d, want 2 (intra-file duplicate must be skipped)", count)
	}

	list, err := svc.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("List() returned %d servers, want 2", len(list))
	}
}

// Empty password/passphrase are not written (agent auth, or leaving a
// secret unchanged on edit).
func TestCreateWithoutSecretWritesNothing(t *testing.T) {
	svc, store := newServiceWithSecrets(t, &fakeDialer{})
	srv, _ := svc.Create(CreateServerInput{
		Name: "box", Host: "10.0.1.20", Port: 22, User: "deploy",
		AuthType: domain.AuthAgent,
	})
	if _, err := store.GetPassword(srv.ID); !errors.Is(err, secret.ErrNotStored) {
		t.Fatal("agent server should store no password")
	}
}
