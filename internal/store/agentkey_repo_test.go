package store

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

func newKeyRepos(t *testing.T) (*AgentKeyRepo, *SignLogRepo, *ServerRepo) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	return NewAgentKeyRepo(db), NewSignLogRepo(db), NewServerRepo(db)
}

func sampleKey(id, name, fp string) *domain.AgentKey {
	return &domain.AgentKey{ID: id, Name: name, Type: "ssh-ed25519", Fingerprint: fp, PublicKey: "ssh-ed25519 AAAA", RequireConfirm: true}
}

func TestAgentKeyRepoCRUD(t *testing.T) {
	r, _, _ := newKeyRepos(t)
	if err := r.Create(sampleKey("k1", "work", "SHA256:a")); err != nil {
		t.Fatal(err)
	}
	if err := r.Create(sampleKey("k2", "Alpha", "SHA256:b")); err != nil {
		t.Fatal(err)
	}
	if err := r.Create(sampleKey("k3", "dup", "SHA256:a")); err == nil {
		t.Fatal("duplicate fingerprint accepted")
	}

	list, err := r.List()
	if err != nil || len(list) != 2 || list[0].Name != "Alpha" {
		t.Fatalf("List = %+v, %v", list, err)
	}
	if k, err := r.GetByFingerprint("SHA256:b"); err != nil || k.ID != "k2" {
		t.Fatalf("GetByFingerprint = %+v, %v", k, err)
	}
	if k, err := r.GetByName("WORK"); err != nil || k.ID != "k1" {
		t.Fatalf("GetByName = %+v, %v", k, err)
	}
	if err := r.UpdateName("k1", "Work laptop"); err != nil {
		t.Fatal(err)
	}
	if err := r.UpdateRequireConfirm("k1", false); err != nil {
		t.Fatal(err)
	}
	at := time.Now().Truncate(time.Second)
	if err := r.Touch("k1", at); err != nil {
		t.Fatal(err)
	}
	k, err := r.Get("k1")
	if err != nil || k.Name != "Work laptop" || k.RequireConfirm || k.LastUsedAt == nil || !k.LastUsedAt.Equal(at) {
		t.Fatalf("Get = %+v, %v", k, err)
	}
	if err := r.UpdateName("nope", "x"); !errors.Is(err, ErrKeyNotFound) {
		t.Fatalf("UpdateName(missing) = %v", err)
	}
	if err := r.Delete("k1"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Get("k1"); !errors.Is(err, ErrKeyNotFound) {
		t.Fatalf("Get after delete = %v", err)
	}
	if err := r.DeleteAll(); err != nil {
		t.Fatal(err)
	}
	if list, _ := r.List(); len(list) != 0 {
		t.Fatalf("DeleteAll left %d", len(list))
	}
}

func TestSignLogPrunesToMax(t *testing.T) {
	_, log, _ := newKeyRepos(t)
	log.max = 5
	for i := 0; i < 8; i++ {
		if err := log.Insert(&domain.AgentSignEvent{KeyName: "k", Outcome: domain.SignAllowed, ClientPID: i}); err != nil {
			t.Fatal(err)
		}
	}
	evs, err := log.List(0)
	if err != nil || len(evs) != 5 {
		t.Fatalf("List = %d, %v", len(evs), err)
	}
	if evs[0].ClientPID != 7 || evs[4].ClientPID != 3 {
		t.Fatalf("kept the wrong rows: first %d last %d", evs[0].ClientPID, evs[4].ClientPID)
	}
	if evs, _ := log.List(2); len(evs) != 2 {
		t.Fatalf("List(2) = %d", len(evs))
	}
	if err := log.DeleteAll(); err != nil {
		t.Fatal(err)
	}
	if evs, _ := log.List(0); len(evs) != 0 {
		t.Fatalf("DeleteAll left %d", len(evs))
	}
}

func TestSignLogDefaultKeeps500(t *testing.T) {
	_, log, _ := newKeyRepos(t)
	for i := 0; i < MaxSignEvents+3; i++ {
		if err := log.Insert(&domain.AgentSignEvent{Outcome: domain.SignAllowed}); err != nil {
			t.Fatal(err)
		}
	}
	if evs, _ := log.List(1000); len(evs) != MaxSignEvents {
		t.Fatalf("kept %d, want %d", len(evs), MaxSignEvents)
	}
}

func TestServerAgentKeyIDIsUpdatable(t *testing.T) {
	_, _, servers := newKeyRepos(t)
	s := sample("s1", "db", "")
	if err := servers.Create(s); err != nil {
		t.Fatal(err)
	}
	id := "k1"
	s.AuthType = domain.AuthZishKey
	s.AgentKeyID = &id
	if err := servers.Update(s); err != nil {
		t.Fatal(err)
	}
	got, err := servers.Get("s1")
	if err != nil || got.AgentKeyID == nil || *got.AgentKeyID != "k1" {
		t.Fatalf("Get = %+v, %v", got, err)
	}
	other := sample("s2", "app", "")
	if err := servers.Create(other); err != nil {
		t.Fatal(err)
	}
	using, err := servers.ListByAgentKey("k1")
	if err != nil || len(using) != 1 || using[0].ID != "s1" {
		t.Fatalf("ListByAgentKey = %+v, %v", using, err)
	}
	s.AgentKeyID = nil
	s.AuthType = domain.AuthAgent
	if err := servers.Update(s); err != nil {
		t.Fatal(err)
	}
	if using, _ := servers.ListByAgentKey("k1"); len(using) != 0 {
		t.Fatalf("still using after clear: %+v", using)
	}
}
