package service

import (
	"sync"

	"github.com/salawat/sshmgr/internal/sshx"
)

// ConnRegistry tracks the live SSH connections per server so a feature that
// needs to run a command on a host — the detail page's Health card — can reuse
// one instead of dialing again (which could prompt for a host key or 2FA just
// to view a page). SSHService adds a connection when a terminal session opens
// and removes it when the session ends; HealthService reads.
//
// A server can hold several connections (one per terminal tab); any live one
// will do for a probe, so Get returns the most recent.
type ConnRegistry struct {
	mu    sync.Mutex
	conns map[string][]*sshx.Conn
}

// NewConnRegistry builds an empty registry.
func NewConnRegistry() *ConnRegistry {
	return &ConnRegistry{conns: map[string][]*sshx.Conn{}}
}

// Add records a live connection for a server.
func (r *ConnRegistry) Add(serverID string, conn *sshx.Conn) {
	if conn == nil {
		return
	}
	r.mu.Lock()
	r.conns[serverID] = append(r.conns[serverID], conn)
	r.mu.Unlock()
}

// Remove drops a connection when its session ends. Removing the last one for a
// server clears the key so Get reports the server as having no live connection.
func (r *ConnRegistry) Remove(serverID string, conn *sshx.Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	list := r.conns[serverID]
	for i, c := range list {
		if c == conn {
			r.conns[serverID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(r.conns[serverID]) == 0 {
		delete(r.conns, serverID)
	}
}

// Get returns the most recent live connection for a server, or nil if none is
// open. The caller must treat a returned connection as possibly-just-closed (a
// session ending races Remove) and fall back to "no connection" if a command on
// it fails.
func (r *ConnRegistry) Get(serverID string) *sshx.Conn {
	r.mu.Lock()
	defer r.mu.Unlock()
	list := r.conns[serverID]
	if len(list) == 0 {
		return nil
	}
	return list[len(list)-1]
}
