package service

import (
	"errors"
	"net"
	"strconv"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

// agentKeySource is the agent's KeySource: metadata rows plus Keychain keys.
type agentKeySource struct {
	keys   *store.AgentKeyRepo
	secret secret.Store
}

// NewAgentKeySource returns the KeySource main.go hands to agent.NewCore.
func NewAgentKeySource(keys *store.AgentKeyRepo, sec secret.Store) agent.KeySource {
	return agentKeySource{keys: keys, secret: sec}
}

func (a agentKeySource) List() ([]domain.AgentKey, error) { return a.keys.List() }

func (a agentKeySource) LoadSigner(id string) (ssh.Signer, error) {
	der, err := a.secret.GetAgentKey(id)
	if errors.Is(err, secret.ErrNotStored) {
		return nil, agent.ErrKeyMissing
	}
	if err != nil {
		return nil, err
	}
	defer clear(der)
	s, err := agent.SignerFromPKCS8(der)
	if err != nil {
		return nil, agent.ErrKeyMissing
	}
	return s, nil
}

func (a agentKeySource) Touch(id string, at time.Time) error { return a.keys.Touch(id, at) }

// signLogger persists each decision and pushes it to the UI as agent:sign.
type signLogger struct {
	repo *store.SignLogRepo
	emit Emitter
}

// NewSignLogger returns the SignLogger main.go hands to agent.NewCore.
func NewSignLogger(repo *store.SignLogRepo, emit Emitter) agent.SignLogger {
	return signLogger{repo: repo, emit: emit}
}

func (l signLogger) Record(ev domain.AgentSignEvent) {
	_ = l.repo.Insert(&ev)
	if l.emit != nil {
		l.emit.Emit("agent:sign", ev)
	}
}

// HostMatcher is the non-prompting known_hosts check (*sshx.Verifier).
type HostMatcher interface {
	Matches(hostport string, key ssh.PublicKey) bool
}

type hostResolver struct {
	servers *store.ServerRepo
	known   HostMatcher
}

// NewHostResolver names the Zish server a session-bind host key belongs to.
func NewHostResolver(servers *store.ServerRepo, known HostMatcher) agent.HostResolver {
	return hostResolver{servers: servers, known: known}
}

// Resolve prefers a production match: two servers can share a host key, and
// the production rule must not depend on which one is listed first.
func (h hostResolver) Resolve(key ssh.PublicKey) agent.Host {
	list, err := h.servers.List()
	if err != nil {
		return agent.Host{}
	}
	var found *domain.Server
	for i := range list {
		s := &list[i]
		if !h.known.Matches(net.JoinHostPort(s.Host, strconv.Itoa(s.Port)), key) {
			continue
		}
		if found == nil || (s.Environment == domain.EnvProd && found.Environment != domain.EnvProd) {
			found = s
		}
	}
	if found == nil {
		return agent.Host{}
	}
	host := agentTarget(found)
	host.Via = jumpNames(found, list)
	return host
}

// KeyOnProd reports whether a production server signs in with the Zish key.
func (h hostResolver) KeyOnProd(keyID string) bool {
	list, err := h.servers.ListByAgentKey(keyID)
	if err != nil {
		return true
	}
	for _, s := range list {
		if s.Environment == domain.EnvProd {
			return true
		}
	}
	return false
}

// agentTarget describes a server for the approval prompt.
func agentTarget(s *domain.Server) agent.Host {
	addr := s.User + "@" + s.Host
	if s.Port != 0 && s.Port != 22 {
		addr = s.User + "@" + net.JoinHostPort(s.Host, strconv.Itoa(s.Port))
	}
	return agent.Host{Name: s.Name, Address: addr, Env: string(s.Environment)}
}

// jumpNames lists a server's jump hosts, the one nearest the Mac first.
func jumpNames(s *domain.Server, all []domain.Server) []string {
	byID := make(map[string]*domain.Server, len(all))
	for i := range all {
		byID[all[i].ID] = &all[i]
	}
	var via []string
	for cur := s; cur.JumpID != nil && len(via) < 8; {
		next, ok := byID[*cur.JumpID]
		if !ok {
			break
		}
		via = append([]string{next.Name}, via...)
		cur = next
	}
	return via
}
