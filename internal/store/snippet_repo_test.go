package store

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func newSnippetRepo(t *testing.T) *SnippetRepo {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	return NewSnippetRepo(db)
}

func sampleSnippet(id, name string, scope domain.SnippetScope, scopeRef string, slot int) *domain.Snippet {
	return &domain.Snippet{
		ID:       id,
		Name:     name,
		Body:     "echo hi",
		Scope:    scope,
		ScopeRef: scopeRef,
		Slot:     slot,
	}
}

func TestSnippetCreateThenListThenGet(t *testing.T) {
	repo := newSnippetRepo(t)
	if err := repo.Create(sampleSnippet("sn1", "hello", domain.ScopeGlobal, "", 1)); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	list, err := repo.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 1 || list[0].ID != "sn1" {
		t.Fatalf("List() = %v, want exactly [sn1]", list)
	}

	got, err := repo.Get("sn1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Name != "hello" || got.Slot != 1 {
		t.Errorf("Get = %+v, want Name=hello Slot=1", got)
	}
}

func TestSnippetListOrdersBySlotThenName(t *testing.T) {
	repo := newSnippetRepo(t)
	seed := []*domain.Snippet{
		sampleSnippet("b", "bravo", domain.ScopeGlobal, "", 1),
		sampleSnippet("a", "alpha", domain.ScopeGlobal, "", 1),
		sampleSnippet("z", "zulu", domain.ScopeGlobal, "", 0),
	}
	for _, s := range seed {
		if err := repo.Create(s); err != nil {
			t.Fatalf("Create(%s) error = %v", s.ID, err)
		}
	}

	list, err := repo.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	var ids []string
	for _, s := range list {
		ids = append(ids, s.ID)
	}
	want := []string{"z", "a", "b"}
	if len(ids) != len(want) {
		t.Fatalf("List ids = %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("List ids = %v, want %v (order slot,name)", ids, want)
		}
	}
}

func TestSnippetGetMissingReturnsErrNotFound(t *testing.T) {
	repo := newSnippetRepo(t)
	if _, err := repo.Get("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get error = %v, want domain.ErrNotFound", err)
	}
}

func TestSnippetUpdateChangesFields(t *testing.T) {
	repo := newSnippetRepo(t)
	s := sampleSnippet("sn1", "hello", domain.ScopeGlobal, "", 0)
	if err := repo.Create(s); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	s.Name = "renamed"
	s.Body = "echo renamed"
	s.Slot = 5
	if err := repo.Update(s); err != nil {
		t.Fatalf("Update error = %v", err)
	}

	got, err := repo.Get("sn1")
	if err != nil {
		t.Fatalf("Get error = %v", err)
	}
	if got.Name != "renamed" || got.Body != "echo renamed" || got.Slot != 5 {
		t.Errorf("after Update: %+v, want Name=renamed Body='echo renamed' Slot=5", got)
	}
}

func TestSnippetUpdateMissingReturnsErrNotFound(t *testing.T) {
	repo := newSnippetRepo(t)
	if err := repo.Update(sampleSnippet("ghost", "x", domain.ScopeGlobal, "", 0)); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update error = %v, want domain.ErrNotFound", err)
	}
}

func TestSnippetDeleteThenGetReturnsErrNotFound(t *testing.T) {
	repo := newSnippetRepo(t)
	if err := repo.Create(sampleSnippet("sn1", "hello", domain.ScopeGlobal, "", 0)); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	if err := repo.Delete("sn1"); err != nil {
		t.Fatalf("Delete error = %v", err)
	}
	if _, err := repo.Get("sn1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get after Delete = %v, want domain.ErrNotFound", err)
	}
}

func TestSnippetDeleteMissingReturnsErrNotFound(t *testing.T) {
	repo := newSnippetRepo(t)
	if err := repo.Delete("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Delete error = %v, want domain.ErrNotFound", err)
	}
}

// TestSnippetApplicableToReturnsGlobalMatchingGroupAndServer pins the
// exact filter ApplicableTo runs: global snippets always apply; a
// group-scoped snippet applies only when its ScopeRef equals groupName; a
// server-scoped snippet applies only when its ScopeRef equals serverID.
// group-other and server-other are seeded specifically to prove a
// non-matching group/server is excluded, not merely that matches are
// included.
func TestSnippetApplicableToReturnsGlobalMatchingGroupAndServer(t *testing.T) {
	repo := newSnippetRepo(t)
	seed := []*domain.Snippet{
		sampleSnippet("global1", "g", domain.ScopeGlobal, "", 0),
		sampleSnippet("group-match", "gm", domain.ScopeGroup, "Prod", 1),
		sampleSnippet("group-other", "go", domain.ScopeGroup, "Staging", 2),
		sampleSnippet("server-match", "sm", domain.ScopeServer, "s1", 3),
		sampleSnippet("server-other", "so", domain.ScopeServer, "s2", 4),
	}
	for _, s := range seed {
		if err := repo.Create(s); err != nil {
			t.Fatalf("Create(%s) error = %v", s.ID, err)
		}
	}

	got, err := repo.ApplicableTo("s1", "Prod")
	if err != nil {
		t.Fatalf("ApplicableTo error = %v", err)
	}

	var ids []string
	for _, s := range got {
		ids = append(ids, s.ID)
	}
	want := []string{"global1", "group-match", "server-match"}
	if len(ids) != len(want) {
		t.Fatalf("ApplicableTo ids = %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("ApplicableTo ids = %v, want %v (order slot,name)", ids, want)
		}
	}
}
