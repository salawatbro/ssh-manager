package service

import (
	"net"
	"os"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

type pinStub bool

func (p pinStub) HasPin() bool { return bool(p) }

type agentStub AgentStatus

func (a agentStub) Status() AgentStatus { return AgentStatus(a) }

type knownStub map[string]bool

func (k knownStub) Known(hostport string) bool { return k[hostport] }

type securityDB struct {
	servers  *store.ServerRepo
	keys     *store.AgentKeyRepo
	settings *SettingsService
}

func openSecurityDB(t *testing.T) securityDB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	servers := store.NewServerRepo(db)
	s := srv("1", "db", withAuth(domain.AuthPassword))
	if err := servers.Create(&s); err != nil {
		t.Fatal(err)
	}
	return securityDB{servers: servers, keys: store.NewAgentKeyRepo(db), settings: NewSettingsService(store.NewSettingsRepo(db), nil)}
}

// The socket facts come from a real Lstat: a listening unix socket reads as
// a socket with its own mode and owner.
func TestSecuritySocketFactsFromRealSocket(t *testing.T) {
	dir, err := os.MkdirTemp("/tmp", "zsec")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	path := filepath.Join(dir, "agent.sock")
	ln, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	svc := NewSecurityService(nil, nil, nil, nil, nil, nil)

	for _, mode := range []os.FileMode{0o600, 0o666} {
		if err := os.Chmod(path, mode); err != nil {
			t.Fatal(err)
		}
		sf := svc.socketFacts(AgentStatus{Running: true, SocketPath: path})
		if !sf.served || sf.statErr != nil || !sf.isSocket || !sf.mine || sf.perm != mode {
			t.Fatalf("mode %04o: facts = %+v", mode, sf)
		}
	}
	if sf := svc.socketFacts(AgentStatus{Running: false, SocketPath: path}); sf.served {
		t.Fatal("a stopped agent's socket counted as served")
	}
	if sf := svc.socketFacts(AgentStatus{Running: true, SocketPath: filepath.Join(dir, "missing.sock")}); sf.statErr == nil {
		t.Fatal("a missing socket had no stat error")
	}
	regular := filepath.Join(dir, "plain")
	if err := os.WriteFile(regular, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if sf := svc.socketFacts(AgentStatus{Running: true, SocketPath: regular}); sf.isSocket {
		t.Fatal("a regular file read as a socket")
	}
}
