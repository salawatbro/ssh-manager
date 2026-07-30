package store

import (
	"testing"
)

func newSessionStateRepo(t *testing.T) *SessionStateRepo {
	t.Helper()
	db, err := Open(t.TempDir() + "/db.sqlite")
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	return NewSessionStateRepo(db)
}

func TestSessionStateRoundTrip(t *testing.T) {
	r := newSessionStateRepo(t)

	// A fresh install has nothing saved — an empty slice, not an error.
	got, err := r.LoadOpenTabs()
	if err != nil {
		t.Fatalf("LoadOpenTabs error = %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("fresh LoadOpenTabs = %v, want empty", got)
	}

	if err := r.SaveOpenTabs([]string{"a", "b", "c"}); err != nil {
		t.Fatalf("SaveOpenTabs error = %v", err)
	}
	got, _ = r.LoadOpenTabs()
	if len(got) != 3 || got[0] != "a" || got[2] != "c" {
		t.Fatalf("LoadOpenTabs = %v, want [a b c] in order", got)
	}

	// Saving again replaces (single row, not append).
	if err := r.SaveOpenTabs([]string{"x"}); err != nil {
		t.Fatal(err)
	}
	got, _ = r.LoadOpenTabs()
	if len(got) != 1 || got[0] != "x" {
		t.Fatalf("after replace = %v, want [x]", got)
	}

	// A nil slice saves as empty, not null.
	if err := r.SaveOpenTabs(nil); err != nil {
		t.Fatal(err)
	}
	got, _ = r.LoadOpenTabs()
	if got == nil || len(got) != 0 {
		t.Fatalf("nil save → %v, want empty slice", got)
	}
}
