package store

import (
	"errors"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestServerUpdateWritesLookAndOnConnect(t *testing.T) {
	r := newRepo(t)
	s := sample("s1", "web", "Prod")
	s.Icon, s.Color, s.RunAfterConnect, s.Terminal = "globe", "sky", "cd /srv", domain.TerminalITerm2
	if err := r.Create(s); err != nil {
		t.Fatal(err)
	}
	got, _ := r.Get("s1")
	if got.Icon != "globe" || got.Color != "sky" || got.RunAfterConnect != "cd /srv" || got.Terminal != domain.TerminalITerm2 {
		t.Fatalf("Create lost fields: %+v", got)
	}

	cleared := sample("s1", "web", "Prod")
	if err := r.Update(cleared); err != nil {
		t.Fatal(err)
	}
	got, _ = r.Get("s1")
	if got.Icon != "" || got.Color != "" || got.RunAfterConnect != "" || got.Terminal != "" {
		t.Fatalf("Update did not clear the fields: %+v", got)
	}
}

func TestServerSetLookWritesOnlyIconAndColor(t *testing.T) {
	r := newRepo(t)
	s := sample("s1", "web", "Prod")
	s.Notes, s.RunAfterConnect, s.Terminal = "keep me", "htop", domain.TerminalKitty
	if err := r.Create(s); err != nil {
		t.Fatal(err)
	}
	if err := r.SetPinned("s1", true); err != nil {
		t.Fatal(err)
	}
	if err := r.BumpUsage("s1"); err != nil {
		t.Fatal(err)
	}
	before, _ := r.Get("s1")

	time.Sleep(5 * time.Millisecond)
	if err := r.SetLook("s1", "letters:🚀", "pink"); err != nil {
		t.Fatalf("SetLook = %v", err)
	}
	after, _ := r.Get("s1")
	if after.Icon != "letters:🚀" || after.Color != "pink" {
		t.Fatalf("SetLook not persisted: icon %q color %q", after.Icon, after.Color)
	}
	after.Icon, after.Color = before.Icon, before.Color
	if after.Name != before.Name || after.Notes != before.Notes || after.RunAfterConnect != before.RunAfterConnect ||
		after.Terminal != before.Terminal || !after.Pinned || after.UseCount != before.UseCount ||
		!after.LastUsedAt.Equal(*before.LastUsedAt) || !after.UpdatedAt.Equal(before.UpdatedAt) ||
		!after.CreatedAt.Equal(before.CreatedAt) {
		t.Fatalf("SetLook touched other columns:\nbefore %+v\nafter  %+v", before, after)
	}

	if err := r.SetLook("nope", "globe", "red"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("SetLook(missing) = %v, want ErrNotFound", err)
	}
}

func TestForwardLookIsUpdatableAndSetLookIsolated(t *testing.T) {
	servers, forwards := newForwardRepos(t)
	if err := servers.Create(sample("s1", "web", "Prod")); err != nil {
		t.Fatal(err)
	}
	f := sampleForward("f1", "s1")
	f.Icon, f.Color = "database", "teal"
	if err := forwards.Create(f); err != nil {
		t.Fatal(err)
	}

	edited := sampleForward("f1", "s1")
	edited.Name, edited.Icon, edited.Color = "pg", "plug", "amber"
	if err := forwards.Update(edited); err != nil {
		t.Fatal(err)
	}
	got, _ := forwards.Get("f1")
	if got.Name != "pg" || got.Icon != "plug" || got.Color != "amber" {
		t.Fatalf("Update did not write the look: %+v", got)
	}

	if err := forwards.SetLook("f1", "", "violet"); err != nil {
		t.Fatal(err)
	}
	after, _ := forwards.Get("f1")
	if after.Icon != "" || after.Color != "violet" || after.Name != "pg" || after.BindPort != got.BindPort ||
		after.DestHost != got.DestHost || !after.UpdatedAt.Equal(got.UpdatedAt) {
		t.Fatalf("SetLook wrote the wrong columns: %+v", after)
	}
	if err := forwards.SetLook("nope", "", ""); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("SetLook(missing) = %v, want ErrNotFound", err)
	}
}
