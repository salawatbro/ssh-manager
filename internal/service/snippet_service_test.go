package service

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// newSnippetService wires a SnippetService over a real, temp-file database —
// same setup style as newForwardService, minus the secret/dialer/manager
// doubles a snippet never needs (SEC-01: no secret).
func newSnippetService(t *testing.T) (*SnippetService, *store.SnippetRepo) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("store.Open error = %v", err)
	}
	repo := store.NewSnippetRepo(db)
	return NewSnippetService(repo), repo
}

func validSnippetInput() SnippetInput {
	return SnippetInput{
		Name:  "list dir",
		Body:  "ls -la",
		Scope: domain.ScopeGlobal,
		Slot:  1,
	}
}

// SEC-08: the frontend already validated; the service validates again, and a
// bad input must not reach the database at all.
func TestSnippetCreateRejectsInvalidInput(t *testing.T) {
	svc, _ := newSnippetService(t)

	in := validSnippetInput()
	in.Name = "" // invalid

	_, err := svc.Create(in)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Create error = %v, want ERR_VALIDATION", err)
	}

	list, lerr := svc.List()
	if lerr != nil {
		t.Fatalf("List error = %v", lerr)
	}
	if len(list) != 0 {
		t.Fatalf("List() = %d snippets, want 0 (nothing should be persisted)", len(list))
	}
}

func TestSnippetCreatePersistsWithUUID(t *testing.T) {
	svc, _ := newSnippetService(t)

	got, err := svc.Create(validSnippetInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if got.ID == "" {
		t.Error("Create did not assign an ID")
	}

	list, err := svc.List()
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	if len(list) != 1 || list[0].ID != got.ID {
		t.Fatalf("List() = %+v, want it to contain the created snippet", list)
	}
}

func TestSnippetUpdateChangesEditableFields(t *testing.T) {
	svc, _ := newSnippetService(t)

	created, err := svc.Create(validSnippetInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := validSnippetInput()
	in.ID = created.ID
	in.Name = "renamed"
	in.Body = "echo renamed"
	in.Slot = 5
	got, err := svc.Update(in)
	if err != nil {
		t.Fatalf("Update error = %v", err)
	}
	if got.Name != "renamed" || got.Body != "echo renamed" || got.Slot != 5 {
		t.Fatalf("Update = %+v, want Name=renamed Body='echo renamed' Slot=5", got)
	}
}

func TestSnippetUpdateRejectsInvalidInput(t *testing.T) {
	svc, _ := newSnippetService(t)

	created, err := svc.Create(validSnippetInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}

	in := validSnippetInput()
	in.ID = created.ID
	in.Scope = "bogus" // invalid
	var de *domain.Error
	if _, err := svc.Update(in); !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("Update(invalid) error = %v, want ERR_VALIDATION", err)
	}
}

func TestSnippetUpdateUnknownIDReturnsErrNotFound(t *testing.T) {
	svc, _ := newSnippetService(t)

	in := validSnippetInput()
	in.ID = "ghost"
	if _, err := svc.Update(in); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update(unknown) error = %v, want domain.ErrNotFound", err)
	}
}

func TestSnippetDeleteRemoves(t *testing.T) {
	svc, _ := newSnippetService(t)

	created, err := svc.Create(validSnippetInput())
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("Delete error = %v", err)
	}
	list, _ := svc.List()
	if len(list) != 0 {
		t.Fatalf("List() = %d after Delete, want 0", len(list))
	}
}

// ApplicableTo scoping: global always applies; group/server scoped snippets
// apply only to a matching groupName/serverID — pinned the same way as
// SnippetRepo's own ApplicableTo test, through the service this time.
func TestSnippetApplicableToScoping(t *testing.T) {
	svc, _ := newSnippetService(t)

	mustCreate := func(name string, scope domain.SnippetScope, scopeRef string) *domain.Snippet {
		in := SnippetInput{Name: name, Body: "echo hi", Scope: scope, ScopeRef: scopeRef}
		got, err := svc.Create(in)
		if err != nil {
			t.Fatalf("Create(%s) error = %v", name, err)
		}
		return got
	}

	global := mustCreate("global", domain.ScopeGlobal, "")
	groupMatch := mustCreate("group-match", domain.ScopeGroup, "Prod")
	mustCreate("group-other", domain.ScopeGroup, "Staging")
	serverMatch := mustCreate("server-match", domain.ScopeServer, "s1")
	mustCreate("server-other", domain.ScopeServer, "s2")

	got, err := svc.ApplicableTo("s1", "Prod")
	if err != nil {
		t.Fatalf("ApplicableTo error = %v", err)
	}
	var ids []string
	for _, s := range got {
		ids = append(ids, s.ID)
	}
	want := []string{global.ID, groupMatch.ID, serverMatch.ID}
	if len(ids) != len(want) {
		t.Fatalf("ApplicableTo ids = %v, want %v", ids, want)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	for _, id := range want {
		if !seen[id] {
			t.Fatalf("ApplicableTo ids = %v, missing %v", ids, id)
		}
	}
}

// BySlot returns the applicable snippet bound to that slot.
func TestSnippetBySlotReturnsApplicableSnippet(t *testing.T) {
	svc, _ := newSnippetService(t)

	in := SnippetInput{Name: "deploy", Body: "make deploy", Scope: domain.ScopeGlobal, Slot: 3}
	created, err := svc.Create(in)
	if err != nil {
		t.Fatalf("Create error = %v", err)
	}
	// A different slot on an equally-applicable snippet must not match.
	other := SnippetInput{Name: "logs", Body: "tail -f log", Scope: domain.ScopeGlobal, Slot: 4}
	if _, err := svc.Create(other); err != nil {
		t.Fatalf("Create(other) error = %v", err)
	}

	got, err := svc.BySlot(3, "s1", "Prod")
	if err != nil {
		t.Fatalf("BySlot error = %v", err)
	}
	if got.ID != created.ID {
		t.Fatalf("BySlot(3) = %+v, want %q", got, created.ID)
	}
}

// A slot scoped to a non-matching group must not be returned by BySlot for a
// different group, even though the slot number matches — scoping wins.
func TestSnippetBySlotRespectsScope(t *testing.T) {
	svc, _ := newSnippetService(t)

	in := SnippetInput{Name: "staging-only", Body: "echo staging", Scope: domain.ScopeGroup, ScopeRef: "Staging", Slot: 2}
	if _, err := svc.Create(in); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	if _, err := svc.BySlot(2, "s1", "Prod"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("BySlot error = %v, want domain.ErrNotFound (scope mismatch)", err)
	}
}

func TestSnippetBySlotNoMatchReturnsErrNotFound(t *testing.T) {
	svc, _ := newSnippetService(t)

	if _, err := svc.BySlot(9, "s1", "Prod"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("BySlot error = %v, want domain.ErrNotFound", err)
	}
}

// Slot 0 means "no slot" — it is never a valid quick-run target, so BySlot(0,
// …) must not return a slot-0 snippet even if one exists and is otherwise
// applicable.
func TestSnippetBySlotZeroNeverMatches(t *testing.T) {
	svc, _ := newSnippetService(t)

	in := SnippetInput{Name: "unslotted", Body: "echo hi", Scope: domain.ScopeGlobal, Slot: 0}
	if _, err := svc.Create(in); err != nil {
		t.Fatalf("Create error = %v", err)
	}

	if _, err := svc.BySlot(0, "s1", "Prod"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("BySlot(0) error = %v, want domain.ErrNotFound", err)
	}
}
