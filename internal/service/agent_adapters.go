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

func (h hostResolver) Resolve(key ssh.PublicKey) string {
	list, err := h.servers.List()
	if err != nil {
		return ""
	}
	for _, s := range list {
		if h.known.Matches(net.JoinHostPort(s.Host, strconv.Itoa(s.Port)), key) {
			return s.Name
		}
	}
	return ""
}
