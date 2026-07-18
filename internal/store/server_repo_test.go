package store

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

func newRepo(t *testing.T) *ServerRepo {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	return NewServerRepo(db)
}

func sample(id, name, group string) *domain.Server {
	return &domain.Server{
		ID:          id,
		Name:        name,
		Host:        "10.0.1.20",
		Port:        22,
		User:        "deploy",
		AuthType:    domain.AuthAgent,
		GroupName:   group,
		Environment: domain.EnvProd,
	}
}

func TestCreateThenGet(t *testing.T) {
	r := newRepo(t)
	if err := r.Create(sample("s1", "cbs-app-01", "Prod")); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	got, err := r.Get("s1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Name != "cbs-app-01" {
		t.Errorf("Name = %q, want %q", got.Name, "cbs-app-01")
	}
	if got.CreatedAt.IsZero() {
		t.Error("CreatedAt was not set")
	}
}

func TestGetMissingReturnsErrNotFound(t *testing.T) {
	r := newRepo(t)
	_, err := r.Get("nope")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get error = %v, want domain.ErrNotFound", err)
	}
}

func TestListOrdersByGroupThenSortOrderThenName(t *testing.T) {
	r := newRepo(t)
	// Insert out of order on purpose.
	zebra := sample("s3", "zebra", "Prod")
	alpha := sample("s2", "alpha", "Prod")
	dev := sample("s1", "dev-box", "Dev")
	pinned := sample("s4", "pinned", "Prod")
	pinned.SortOrder = -1

	for _, s := range []*domain.Server{zebra, alpha, dev, pinned} {
		if err := r.Create(s); err != nil {
			t.Fatalf("Create(%s) error = %v", s.ID, err)
		}
	}

	list, err := r.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	got := make([]string, len(list))
	for i, s := range list {
		got[i] = s.Name
	}
	want := []string{"dev-box", "pinned", "alpha", "zebra"}
	if len(got) != len(want) {
		t.Fatalf("List() returned %d servers, want %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("List() = %v, want %v", got, want)
		}
	}
}

// FR-01.5 groups then sorts alphabetically, and "alphabetically" must not
// mean SQLite's default BINARY collation, which sorts every uppercase byte
// before every lowercase one. A user with "cbs-app-01" and "Bastion" in the
// same group would see an order that looks broken (all-caps names first,
// regardless of the letter) rather than a real alphabetical interleave.
func TestListOrdersNameCaseInsensitively(t *testing.T) {
	r := newRepo(t)
	for _, s := range []*domain.Server{
		sample("s1", "Zebra", "Prod"),
		sample("s2", "alpha", "Prod"),
		sample("s3", "Apple", "Prod"),
		sample("s4", "beta", "Prod"),
	} {
		if err := r.Create(s); err != nil {
			t.Fatalf("Create(%s) error = %v", s.ID, err)
		}
	}

	list, err := r.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	got := make([]string, len(list))
	for i, s := range list {
		got[i] = s.Name
	}
	want := []string{"alpha", "Apple", "beta", "Zebra"}
	if len(got) != len(want) {
		t.Fatalf("List() returned %d servers, want %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("List() = %v, want %v", got, want)
		}
	}
}

func TestUpdateChangesFields(t *testing.T) {
	r := newRepo(t)
	s := sample("s1", "old", "Prod")
	if err := r.Create(s); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	s.Name = "new"
	s.Port = 2222
	if err := r.Update(s); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := r.Get("s1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Name != "new" || got.Port != 2222 {
		t.Errorf("after Update: Name=%q Port=%d, want %q and %d", got.Name, got.Port, "new", 2222)
	}
}

// Editing an existing server to enable 2FA must persist the flag. Regression:
// two_factor was missing from updatableColumns, so Update silently dropped it
// and the toggle reverted to off on reopen.
func TestUpdatePersistsTwoFactor(t *testing.T) {
	r := newRepo(t)
	s := sample("s1", "srv", "Prod")
	s.TwoFactor = false
	if err := r.Create(s); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	s.TwoFactor = true
	if err := r.Update(s); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := r.Get("s1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if !got.TwoFactor {
		t.Error("after Update, TwoFactor = false, want true (two_factor must be an updatable column)")
	}
}

// GORM skips zero values when Updates receives a struct. Without an explicit
// column list, emptying a note would silently do nothing — the UI would
// show the change and the database would not have it.
//
// This test used to also reset SortOrder back to 0 and assert it cleared.
// SortOrder is no longer in updatableColumns (this task excludes it
// alongside last_used_at/use_count, see TestUpdateLeavesUsageColumnsAlone),
// so Update no longer writes it at all; asserting a clear here would just
// be testing that Update leaves it alone, which the usage-columns test
// already covers.
func TestUpdateClearsFieldsBackToZero(t *testing.T) {
	r := newRepo(t)
	s := sample("s1", "x", "Prod")
	s.Notes = "a note"
	if err := r.Create(s); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	s.Notes = ""
	if err := r.Update(s); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := r.Get("s1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Notes != "" {
		t.Errorf("Notes = %q, want it cleared", got.Notes)
	}
}

func TestUpdateDoesNotTouchCreatedAt(t *testing.T) {
	r := newRepo(t)
	s := sample("s1", "x", "Prod")
	if err := r.Create(s); err != nil {
		t.Fatalf("Create error = %v", err)
	}
	original, err := r.Get("s1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}

	s.Name = "renamed"
	s.CreatedAt = time.Now().Add(48 * time.Hour) // a caller sending nonsense
	if err := r.Update(s); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := r.Get("s1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if !got.CreatedAt.Equal(original.CreatedAt) {
		t.Errorf("CreatedAt = %v, want it unchanged at %v", got.CreatedAt, original.CreatedAt)
	}
}

func TestUpdateMissingReturnsErrNotFound(t *testing.T) {
	r := newRepo(t)
	err := r.Update(sample("ghost", "x", "Prod"))
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update error = %v, want domain.ErrNotFound", err)
	}
}

// Update must not touch usage columns. Before the fix, a concurrent
// BumpUsage that landed between a caller's Get and Update was silently
// overwritten by the stale use_count the form round-tripped.
func TestUpdateLeavesUsageColumnsAlone(t *testing.T) {
	repo := newRepo(t)
	s := sample("s1", "box", "Prod")
	if err := repo.Create(s); err != nil {
		t.Fatal(err)
	}
	// Simulate a connection bump.
	if err := repo.BumpUsage("s1"); err != nil {
		t.Fatal(err)
	}
	// A form-driven Update carrying a stale (zero) use_count.
	edit := sample("s1", "box-renamed", "Prod")
	edit.UseCount = 0
	edit.LastUsedAt = nil
	if err := repo.Update(edit); err != nil {
		t.Fatal(err)
	}
	got, _ := repo.Get("s1")
	if got.Name != "box-renamed" {
		t.Fatalf("name not updated: %q", got.Name)
	}
	if got.UseCount != 1 {
		t.Fatalf("use_count clobbered by Update: got %d, want 1", got.UseCount)
	}
	if got.LastUsedAt == nil {
		t.Fatal("last_used_at clobbered by Update")
	}
}

func TestBumpUsageIncrementsAndStamps(t *testing.T) {
	repo := newRepo(t)
	_ = repo.Create(sample("s1", "box", "Prod"))
	for i := 0; i < 3; i++ {
		if err := repo.BumpUsage("s1"); err != nil {
			t.Fatal(err)
		}
	}
	got, _ := repo.Get("s1")
	if got.UseCount != 3 {
		t.Fatalf("use_count = %d, want 3", got.UseCount)
	}
}

func TestBumpUsageMissingReturnsErrNotFound(t *testing.T) {
	repo := newRepo(t)
	if err := repo.BumpUsage("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}

func TestDeleteRemovesTheServer(t *testing.T) {
	r := newRepo(t)
	if err := r.Create(sample("s1", "x", "Prod")); err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := r.Delete("s1"); err != nil {
		t.Fatalf("Delete error = %v", err)
	}
	if _, err := r.Get("s1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get after Delete = %v, want domain.ErrNotFound", err)
	}
}

func TestDeleteMissingReturnsErrNotFound(t *testing.T) {
	r := newRepo(t)
	if err := r.Delete("ghost"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Delete error = %v, want domain.ErrNotFound", err)
	}
}

// TestDeleteRefusesWhenAnotherServerJumpsThroughIt pins today's behavior for
// deleting a server that another server's JumpID still references. Foreign
// keys are enforced on every pooled connection (db.go's dsn comment), so
// SQLite rejects the delete outright: not a cascade, not an orphaned
// jump_id, a hard error with both rows left intact.
//
// That is a defensible choice — deleting a bastion should not silently
// break the servers behind it — but nothing pinned it, and no v0.1 user can
// even create a JumpID yet (the jump-host picker is v0.6). Whether v0.6
// should keep this RESTRICT behavior, switch to ON DELETE SET NULL, or
// surface a friendlier "N servers still jump through this host" error is an
// open decision for that phase. This test documents today's behavior; it
// does not bless it as permanent.
func TestDeleteRefusesWhenAnotherServerJumpsThroughIt(t *testing.T) {
	r := newRepo(t)
	bastion := sample("bastion", "bastion", "Prod")
	if err := r.Create(bastion); err != nil {
		t.Fatalf("Create(bastion) error = %v", err)
	}

	jumpID := "bastion"
	db01 := sample("db-01", "db-01", "Prod")
	db01.JumpID = &jumpID
	if err := r.Create(db01); err != nil {
		t.Fatalf("Create(db-01) error = %v", err)
	}

	if err := r.Delete("bastion"); err == nil {
		t.Fatal("Delete(bastion) succeeded while db-01 still jumps through it, want an error")
	}

	if _, err := r.Get("bastion"); err != nil {
		t.Fatalf("Get(bastion) after refused Delete = %v, want the row to still exist", err)
	}
	if _, err := r.Get("db-01"); err != nil {
		t.Fatalf("Get(db-01) after refused Delete = %v, want the row to still exist", err)
	}

	// Happy path: deleting the dependent server first, then the bastion,
	// still works.
	if err := r.Delete("db-01"); err != nil {
		t.Fatalf("Delete(db-01) error = %v", err)
	}
	if err := r.Delete("bastion"); err != nil {
		t.Fatalf("Delete(bastion) error = %v", err)
	}
}

// TestCreateWithDanglingJumpIDFails is not in the task brief; it was added
// to close a coverage gap in Create's error path. Open now enforces foreign
// keys on every pooled connection (see db.go's dsn comment), so a JumpID
// that names no existing server must be rejected here too.
func TestCreateWithDanglingJumpIDFails(t *testing.T) {
	r := newRepo(t)
	dangling := "does-not-exist"
	s := sample("s1", "x", "Prod")
	s.JumpID = &dangling

	if err := r.Create(s); err == nil {
		t.Fatal("Create with a dangling JumpID succeeded, want a foreign key error")
	}
}

// TestCountByJumpID backs Delete's ability to refuse cleanly with a clear
// message before touching a row that other servers still jump through (see
// TestDeleteRefusesWhenAnotherServerJumpsThroughIt): the count must be 0
// when nothing references the jump host, and match the exact number of
// dependents when several do.
func TestCountByJumpID(t *testing.T) {
	r := newRepo(t)
	jump := sample("j", "bastion", "Prod")
	if err := r.Create(jump); err != nil {
		t.Fatalf("Create(bastion) error = %v", err)
	}

	if n, err := r.CountByJumpID("j"); err != nil || n != 0 {
		t.Fatalf("CountByJumpID(unused) = %d, %v; want 0, nil", n, err)
	}

	jumpID := "j"
	for _, id := range []string{"a", "b"} {
		s := sample(id, id, "Prod")
		s.JumpID = &jumpID
		if err := r.Create(s); err != nil {
			t.Fatalf("Create(%s) error = %v", id, err)
		}
	}

	n, err := r.CountByJumpID("j")
	if err != nil || n != 2 {
		t.Fatalf("CountByJumpID = %d, %v; want 2, nil", n, err)
	}
}

func TestGroupsAreDistinctSortedAndSkipEmpty(t *testing.T) {
	r := newRepo(t)
	for _, s := range []*domain.Server{
		sample("s1", "a", "Prod"),
		sample("s2", "b", "Dev"),
		sample("s3", "c", "Prod"),
		sample("s4", "d", ""),
	} {
		if err := r.Create(s); err != nil {
			t.Fatalf("Create(%s) error = %v", s.ID, err)
		}
	}

	groups, err := r.Groups()
	if err != nil {
		t.Fatalf("Groups error = %v", err)
	}
	want := []string{"Dev", "Prod"}
	if len(groups) != len(want) {
		t.Fatalf("Groups() = %v, want %v", groups, want)
	}
	for i := range want {
		if groups[i] != want[i] {
			t.Fatalf("Groups() = %v, want %v", groups, want)
		}
	}
}

func TestSetPinnedPersistsAndClears(t *testing.T) {
	r := newRepo(t)
	if err := r.Create(sample("s1", "cbs-app-01", "Prod")); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	if err := r.SetPinned("s1", true); err != nil {
		t.Fatalf("SetPinned(true) error = %v", err)
	}
	got, _ := r.Get("s1")
	if !got.Pinned {
		t.Fatal("Pinned = false after SetPinned(true), want true")
	}

	if err := r.SetPinned("s1", false); err != nil {
		t.Fatalf("SetPinned(false) error = %v", err)
	}
	got, _ = r.Get("s1")
	if got.Pinned {
		t.Fatal("Pinned = true after SetPinned(false), want false")
	}
}

func TestSetPinnedMissingReturnsErrNotFound(t *testing.T) {
	r := newRepo(t)
	if err := r.SetPinned("nope", true); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("SetPinned error = %v, want domain.ErrNotFound", err)
	}
}

func TestCountPinned(t *testing.T) {
	r := newRepo(t)
	for _, s := range []*domain.Server{
		sample("s1", "a", "Prod"), sample("s2", "b", "Prod"), sample("s3", "c", "Prod"),
	} {
		if err := r.Create(s); err != nil {
			t.Fatalf("Create error = %v", err)
		}
	}
	_ = r.SetPinned("s1", true)
	_ = r.SetPinned("s3", true)

	n, err := r.CountPinned()
	if err != nil {
		t.Fatalf("CountPinned error = %v", err)
	}
	if n != 2 {
		t.Fatalf("CountPinned = %d, want 2", n)
	}
}

// A form Update carries a Server whose Pinned is false (the form doesn't manage
// pinning). updatableColumns must exclude "pinned" so that save never clears an
// existing pin — mirrors the use_count/sort_order exclusion.
func TestUpdateDoesNotClobberPinned(t *testing.T) {
	r := newRepo(t)
	if err := r.Create(sample("s1", "cbs-app-01", "Prod")); err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := r.SetPinned("s1", true); err != nil {
		t.Fatalf("SetPinned error = %v", err)
	}

	edited := sample("s1", "renamed", "Prod") // Pinned defaults false
	if err := r.Update(edited); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, _ := r.Get("s1")
	if got.Name != "renamed" {
		t.Fatalf("Name = %q, want renamed", got.Name)
	}
	if !got.Pinned {
		t.Fatal("Update cleared Pinned; updatableColumns must exclude \"pinned\"")
	}
}
