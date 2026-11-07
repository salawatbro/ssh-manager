package store

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

type stackRepos struct {
	servers  *ServerRepo
	forwards *ForwardRepo
	stacks   *StackRepo
}

func newStackRepos(t *testing.T) stackRepos {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	r := stackRepos{NewServerRepo(db), NewForwardRepo(db), NewStackRepo(db)}
	for _, id := range []string{"s1", "s2"} {
		if err := r.servers.Create(sample(id, id, "")); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.forwards.Create(sampleForward("f1", "s1")); err != nil {
		t.Fatal(err)
	}
	return r
}

func ptr(s string) *string { return &s }

func sampleStack(id, name string) *domain.Stack {
	return &domain.Stack{
		ID: id, Name: name, Icon: "rocket", Shortcut: "alt+cmd+1", InMenuBar: true,
		Steps: []domain.StackStep{
			{Kind: domain.StepServer, ServerID: ptr("s1"), Placement: domain.PlaceTab, RunCommand: "tmux"},
			{Kind: domain.StepTunnel, ForwardID: ptr("f1")},
			{Kind: domain.StepServer, ServerID: ptr("s2"), Placement: domain.PlaceSplit},
		},
	}
}

func TestStackCreateListGet(t *testing.T) {
	r := newStackRepos(t)
	if err := r.stacks.Create(sampleStack("k1", "Deploy")); err != nil {
		t.Fatalf("Create = %v", err)
	}
	if err := r.stacks.Create(&domain.Stack{ID: "k2", Name: "Empty"}); err != nil {
		t.Fatalf("Create empty = %v", err)
	}
	list, err := r.stacks.List()
	if err != nil || len(list) != 2 {
		t.Fatalf("List = %d stacks, %v", len(list), err)
	}
	if list[0].ID != "k1" || list[1].ID != "k2" || list[0].SortOrder != 0 || list[1].SortOrder != 1 {
		t.Fatalf("order = %s/%d, %s/%d", list[0].ID, list[0].SortOrder, list[1].ID, list[1].SortOrder)
	}
	got, err := r.stacks.Get("k1")
	if err != nil {
		t.Fatal(err)
	}
	if !got.InMenuBar || got.Shortcut != "alt+cmd+1" || got.OneApproval {
		t.Fatalf("flags = %+v", got)
	}
	if len(got.Steps) != 3 {
		t.Fatalf("steps = %d", len(got.Steps))
	}
	for i, st := range got.Steps {
		if st.Position != i || st.StackID != "k1" || st.ID == "" {
			t.Errorf("step %d = %+v", i, st)
		}
	}
	if *got.Steps[0].ServerID != "s1" || got.Steps[0].RunCommand != "tmux" || *got.Steps[1].ForwardID != "f1" ||
		got.Steps[2].Placement != domain.PlaceSplit {
		t.Fatalf("steps = %+v", got.Steps)
	}
	if _, err := r.stacks.Get("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get missing = %v", err)
	}
}

// OneApproval false must survive the insert: GORM skips zero values that
// have a column default.
func TestStackCreateKeepsBothApprovalValues(t *testing.T) {
	r := newStackRepos(t)
	on := &domain.Stack{ID: "on", Name: "on", OneApproval: true}
	off := &domain.Stack{ID: "off", Name: "off", OneApproval: false}
	for _, s := range []*domain.Stack{on, off} {
		if err := r.stacks.Create(s); err != nil {
			t.Fatal(err)
		}
	}
	a, _ := r.stacks.Get("on")
	b, _ := r.stacks.Get("off")
	if !a.OneApproval || b.OneApproval {
		t.Fatalf("on = %v, off = %v", a.OneApproval, b.OneApproval)
	}
}

func TestStackUpdateReplacesFieldsAndSteps(t *testing.T) {
	r := newStackRepos(t)
	if err := r.stacks.Create(sampleStack("k1", "Deploy")); err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 11, 5, 9, 12, 0, 0, time.UTC)
	if err := r.stacks.MarkLaunched("k1", at); err != nil {
		t.Fatal(err)
	}
	upd := &domain.Stack{ID: "k1", Name: "Renamed", Shortcut: "", InMenuBar: false, OneApproval: true, SortOrder: 99,
		Steps: []domain.StackStep{{Kind: domain.StepServer, ServerID: ptr("s2"), Placement: domain.PlaceWindow}}}
	if err := r.stacks.Update(upd); err != nil {
		t.Fatalf("Update = %v", err)
	}
	got, _ := r.stacks.Get("k1")
	if got.Name != "Renamed" || got.Shortcut != "" || got.InMenuBar || !got.OneApproval || got.Icon != "" {
		t.Fatalf("fields = %+v", got)
	}
	if got.SortOrder != 0 || got.LastLaunchedAt == nil || !got.LastLaunchedAt.Equal(at) {
		t.Fatalf("lifecycle fields written by Update: order %d, launched %v", got.SortOrder, got.LastLaunchedAt)
	}
	if len(got.Steps) != 1 || *got.Steps[0].ServerID != "s2" {
		t.Fatalf("steps = %+v", got.Steps)
	}
	if err := r.stacks.Update(&domain.Stack{ID: "nope", Name: "x"}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Update missing = %v", err)
	}
}

// Deleting a server or a forward takes its steps with it, and deleting a
// server reaches the steps of its forwards too.
func TestStackStepsFollowDeletes(t *testing.T) {
	r := newStackRepos(t)
	if err := r.stacks.Create(sampleStack("k1", "Deploy")); err != nil {
		t.Fatal(err)
	}
	if err := r.servers.Delete("s2"); err != nil {
		t.Fatal(err)
	}
	got, _ := r.stacks.Get("k1")
	if len(got.Steps) != 2 {
		t.Fatalf("after server delete: %d steps", len(got.Steps))
	}
	if err := r.forwards.Delete("f1"); err != nil {
		t.Fatal(err)
	}
	got, _ = r.stacks.Get("k1")
	if len(got.Steps) != 1 || got.Steps[0].Kind != domain.StepServer {
		t.Fatalf("after forward delete: %+v", got.Steps)
	}

	if err := r.forwards.Create(sampleForward("f2", "s1")); err != nil {
		t.Fatal(err)
	}
	two := &domain.Stack{ID: "k2", Name: "Tunnel", Steps: []domain.StackStep{{Kind: domain.StepTunnel, ForwardID: ptr("f2")}}}
	if err := r.stacks.Create(two); err != nil {
		t.Fatal(err)
	}
	if err := r.servers.Delete("s1"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"k1", "k2"} {
		got, err := r.stacks.Get(id)
		if err != nil || len(got.Steps) != 0 {
			t.Fatalf("%s after server delete: %+v, %v", id, got, err)
		}
	}
}

func TestStackStepRejectsAMissingServer(t *testing.T) {
	r := newStackRepos(t)
	s := &domain.Stack{ID: "k1", Name: "x", Steps: []domain.StackStep{{Kind: domain.StepServer, ServerID: ptr("ghost")}}}
	if err := r.stacks.Create(s); err == nil {
		t.Fatal("a step pointing at no server was saved")
	}
	if _, err := r.stacks.Get("k1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("the failed create left a stack behind: %v", err)
	}
}

func TestStackDelete(t *testing.T) {
	r := newStackRepos(t)
	if err := r.stacks.Create(sampleStack("k1", "Deploy")); err != nil {
		t.Fatal(err)
	}
	if err := r.stacks.Delete("k1"); err != nil {
		t.Fatal(err)
	}
	var steps int64
	r.stacks.db.Model(&domain.StackStep{}).Count(&steps)
	if steps != 0 {
		t.Fatalf("%d steps outlived their stack", steps)
	}
	if err := r.stacks.Delete("k1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Delete twice = %v", err)
	}
	if err := r.stacks.Create(sampleStack("k2", "Again")); err != nil {
		t.Fatal(err)
	}
	if err := r.stacks.DeleteAll(); err != nil {
		t.Fatal(err)
	}
	if list, _ := r.stacks.List(); len(list) != 0 {
		t.Fatalf("DeleteAll left %d", len(list))
	}
}
