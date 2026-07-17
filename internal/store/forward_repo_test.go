package store

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

// newForwardRepos opens a fresh temp database and wires up both repos over
// the same handle, the way a real caller would (ForwardRepo rows carry a
// foreign key into servers, so both repos must share one *gorm.DB).
func newForwardRepos(t *testing.T) (*ServerRepo, *ForwardRepo) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	return NewServerRepo(db), NewForwardRepo(db)
}

func sampleForward(id, serverID string) *domain.PortForward {
	return &domain.PortForward{
		ID:       id,
		ServerID: serverID,
		Name:     "web",
		Type:     domain.ForwardLocal,
		BindAddr: "127.0.0.1",
		BindPort: 8080,
		DestHost: "localhost",
		DestPort: 80,
	}
}

func TestForwardCreateThenListThenGet(t *testing.T) {
	servers, forwards := newForwardRepos(t)
	if err := servers.Create(sample("s1", "box", "Prod")); err != nil {
		t.Fatalf("Create server error = %v", err)
	}

	if err := forwards.Create(sampleForward("f1", "s1")); err != nil {
		t.Fatalf("Create forward error = %v", err)
	}

	list, err := forwards.List("s1")
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 1 || list[0].ID != "f1" {
		t.Fatalf("List(s1) = %v, want exactly [f1]", list)
	}

	got, err := forwards.Get("f1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Name != "web" || got.BindPort != 8080 {
		t.Errorf("Get = %+v, want Name=web BindPort=8080", got)
	}
}

func TestForwardListOnUnknownServerReturnsEmpty(t *testing.T) {
	_, forwards := newForwardRepos(t)
	list, err := forwards.List("no-such-server")
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("List = %v, want empty", list)
	}
}

func TestForwardGetMissingReturnsErrNotFound(t *testing.T) {
	_, forwards := newForwardRepos(t)
	if _, err := forwards.Get("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get error = %v, want domain.ErrNotFound", err)
	}
}

func TestForwardUpdateChangesFields(t *testing.T) {
	servers, forwards := newForwardRepos(t)
	if err := servers.Create(sample("s1", "box", "Prod")); err != nil {
		t.Fatalf("Create server error = %v", err)
	}
	f := sampleForward("f1", "s1")
	if err := forwards.Create(f); err != nil {
		t.Fatalf("Create forward error = %v", err)
	}

	f.Name = "renamed"
	f.BindPort = 9090
	f.DestPort = 443
	if err := forwards.Update(f); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := forwards.Get("f1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Name != "renamed" || got.BindPort != 9090 || got.DestPort != 443 {
		t.Errorf("after Update: %+v, want Name=renamed BindPort=9090 DestPort=443", got)
	}
}

func TestForwardDeleteThenGetReturnsErrNotFound(t *testing.T) {
	servers, forwards := newForwardRepos(t)
	if err := servers.Create(sample("s1", "box", "Prod")); err != nil {
		t.Fatalf("Create server error = %v", err)
	}
	if err := forwards.Create(sampleForward("f1", "s1")); err != nil {
		t.Fatalf("Create forward error = %v", err)
	}

	if err := forwards.Delete("f1"); err != nil {
		t.Fatalf("Delete error = %v", err)
	}
	if _, err := forwards.Get("f1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get after Delete = %v, want domain.ErrNotFound", err)
	}
}

func TestForwardUpdateMissingReturnsErrNotFound(t *testing.T) {
	_, forwards := newForwardRepos(t)
	if err := forwards.Update(sampleForward("ghost", "s1")); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update error = %v, want domain.ErrNotFound", err)
	}
}

// TestForwardCreateWithDanglingServerIDFails pins that port_forwards.server_id
// is a real, enforced foreign key (foreign_keys=ON, see db.go's dsn
// comment), not just an indexed string. A forward naming a server that does
// not exist must be rejected at the database, the same way a dangling
// JumpID is rejected on servers (TestCreateWithDanglingJumpIDFails).
func TestForwardCreateWithDanglingServerIDFails(t *testing.T) {
	_, forwards := newForwardRepos(t)
	if err := forwards.Create(sampleForward("f1", "does-not-exist")); err == nil {
		t.Fatal("Create with a dangling ServerID succeeded, want a foreign key error")
	}
}

// TestForwardCreateIgnoresServerAssociation pins that ForwardRepo.Create
// never triggers GORM's belongs-to autosave on PortForward.Server. That
// field exists only so AutoMigrate can wire the ON DELETE CASCADE FK; it is
// json:"-" and no caller populates it today, but a future caller might. If
// Create ever stopped omitting associations, populating f.Server would (1)
// silently write a phantom row into servers and (2) override the persisted
// ServerID with the association's PK instead of the one the caller set.
func TestForwardCreateIgnoresServerAssociation(t *testing.T) {
	servers, forwards := newForwardRepos(t)
	if err := servers.Create(sample("s1", "box", "Prod")); err != nil {
		t.Fatalf("Create server error = %v", err)
	}

	f := sampleForward("f1", "s1")
	f.Server = &domain.Server{
		ID:       "ghost",
		Name:     "ghost",
		Host:     "h",
		User:     "u",
		Port:     22,
		AuthType: domain.AuthAgent,
	}
	if err := forwards.Create(f); err != nil {
		t.Fatalf("Create forward error = %v", err)
	}

	if _, err := servers.Get("ghost"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get(ghost) = %v, want domain.ErrNotFound (autosave must not write a phantom server row)", err)
	}

	got, err := forwards.Get("f1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.ServerID != "s1" {
		t.Fatalf("Get(f1).ServerID = %q, want %q (autosave must not override ServerID)", got.ServerID, "s1")
	}

	list, err := forwards.List("s1")
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 1 || list[0].ID != "f1" {
		t.Fatalf("List(s1) = %v, want exactly [f1]", list)
	}
}

// TestDeletingServerCascadesToItsForwards proves the ON DELETE CASCADE FK
// from port_forwards.server_id to servers.id actually works end-to-end: a
// PortForward carries no secret of its own (SEC-01), but a tunnel
// definition for a server that no longer exists is just clutter, so
// deleting the server must take its forwards with it rather than leaving
// them orphaned or blocking the delete (contrast with the JumpID
// relationship on Server, which stays RESTRICT).
func TestDeletingServerCascadesToItsForwards(t *testing.T) {
	servers, forwards := newForwardRepos(t)
	if err := servers.Create(sample("s1", "box", "Prod")); err != nil {
		t.Fatalf("Create server error = %v", err)
	}
	if err := forwards.Create(sampleForward("f1", "s1")); err != nil {
		t.Fatalf("Create forward error = %v", err)
	}

	if err := servers.Delete("s1"); err != nil {
		t.Fatalf("Delete server error = %v", err)
	}

	list, err := forwards.List("s1")
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("List(s1) after server delete = %v, want empty (cascade)", list)
	}
	if _, err := forwards.Get("f1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get(f1) after cascade delete = %v, want domain.ErrNotFound", err)
	}
}
