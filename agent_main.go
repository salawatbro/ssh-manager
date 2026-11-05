package main

import (
	"errors"
	"os"
	"time"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/service"
	"github.com/salawat/sshmgr/internal/store"
)

// agentSocketName is the agent's socket in RunDir.
const agentSocketName = "agent.sock"

// startAgent builds Zish's ssh-agent: the core (always, for in-process
// signing), its listener and the AgentService deps. instanceErr is the result
// of taking the single-instance lock: only the holder serves the socket. The
// socket itself starts with ApplyAgentEnabled once the app runs.
func startAgent(as *service.AgentService, keys *store.AgentKeyRepo, logRepo *store.SignLogRepo, servers *store.ServerRepo,
	sec secret.Store, gate *service.LockGate, known service.HostMatcher, dialer service.Dialer, instanceErr error,
) {
	core := agent.NewCore(service.NewAgentKeySource(keys, sec), agentConfirmer{}, gate, service.NewSignLogger(logRepo, appEmitter{}), time.Now)
	core.SetHostResolver(service.NewHostResolver(servers, known))
	// Locking the app wipes decrypted keys and ssh-add keys from memory.
	gate.OnLock(core.Invalidate)

	deps := service.AgentDeps{
		Core: core, Listener: agent.NewListener(core), PrepareSocket: platform.EnsureSocketDir,
		Emitter: appEmitter{}, Dialer: dialer,
	}
	deps.HomeDir, _ = os.UserHomeDir()
	sock, sockErr := platform.SocketPath(agentSocketName)
	deps.SocketPath = sock
	switch {
	case errors.Is(instanceErr, platform.ErrInstanceLocked):
		deps.Unavailable = domain.NewError(domain.CodeLauncherBusy, "In use by another Zish. Quit the other copy to use the agent here.")
	case instanceErr != nil:
		deps.Unavailable = domain.NewError(domain.CodeAgentUnavail, "The run folder isn't usable: "+instanceErr.Error())
	case sockErr != nil:
		deps.Unavailable = domain.NewError(domain.CodeAgentUnavail, "No usable agent socket path: "+sockErr.Error())
	}
	service.SetAgentDeps(as, deps)
}

// pubKeyDir is where the agent writes its public-key files.
func pubKeyDir() string {
	if dir, err := platform.EnsurePubKeyDir(); err == nil {
		return dir
	}
	dir, _ := platform.PubKeyDir()
	return dir
}
