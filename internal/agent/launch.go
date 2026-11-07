package agent

import (
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// LaunchWindow is how long one stack approval covers the stack's signatures.
const LaunchWindow = 60 * time.Second

// LaunchPrompt is set on a ConfirmRequest when one approval covers a whole
// stack launch.
type LaunchPrompt struct {
	Stack   string
	Servers []Host
	Tunnels []string
	Keys    []string
}

// LaunchRequest asks for one approval before a stack opens.
type LaunchRequest struct {
	Stack   string
	KeyIDs  []string // every stored key the stack's servers and tunnels sign with
	Servers []Host
	Tunnels []string
}

// ErrLaunchDenied is ApproveLaunch's error when the user said no.
var ErrLaunchDenied = domain.NewError(domain.CodeValidation, "The stack did not open: the approval was not given.")

// procID pins a process across pid reuse.
type procID struct {
	pid   int
	start int64
}

// launchGrant covers, until it expires, the given keys for Zish's own clients
// and for the processes the launch attached (and their children, like the
// ssh a ProxyJump spawns). It is never listed among the open approvals.
type launchGrant struct {
	stack   string
	fps     map[string]bool
	procs   map[procID]bool
	expires time.Time
}

// LaunchScope is an open stack approval; a nil grant means nothing needed
// approval.
type LaunchScope struct {
	core *Core
	g    *launchGrant
}

// Active reports whether the launch asked for and holds an approval.
func (s *LaunchScope) Active() bool { return s != nil && s.g != nil }

// Attach lets the process pid sign under this approval: the connect helper
// that is about to become the stack's ssh. A process whose start time cannot
// be read is not attached, so its signatures ask as usual.
func (s *LaunchScope) Attach(pid int) {
	if !s.Active() {
		return
	}
	start, ok := procStart(pid)
	if !ok {
		return
	}
	s.core.mu.Lock()
	s.g.procs[procID{pid, start}] = true
	s.core.mu.Unlock()
}

// Close ends the approval early (the launch failed).
func (s *LaunchScope) Close() {
	if !s.Active() {
		return
	}
	s.core.mu.Lock()
	s.core.launches = slices.DeleteFunc(s.core.launches, func(g *launchGrant) bool { return g == s.g })
	s.core.mu.Unlock()
}

// ApproveLaunch asks once for a stack launch when any of its keys needs
// confirmation, and opens an approval for LaunchWindow on yes. A lock always
// asks per signature, so ApproveLaunch refuses while Zish is locked.
func (c *Core) ApproveLaunch(req LaunchRequest) (*LaunchScope, error) {
	if c.lock != nil && c.lock.Locked() {
		return nil, errAgentLocked
	}
	keys, err := c.src.List()
	if err != nil {
		return nil, err
	}
	fps := map[string]bool{}
	var names []string
	for _, k := range keys {
		if k.RequireConfirm && slices.Contains(req.KeyIDs, k.ID) && !fps[k.Fingerprint] {
			fps[k.Fingerprint] = true
			names = append(names, k.Name)
		}
	}
	if len(fps) == 0 {
		return &LaunchScope{core: c}, nil
	}
	if c.conf == nil {
		return nil, errors.New("no confirmation prompt is available")
	}
	release, ok := c.enqueue()
	if !ok {
		return nil, domain.NewError(domain.CodeValidation, "Too many approvals are waiting. Try again in a moment.")
	}
	defer release()
	c.mu.Lock()
	gen := c.gen
	c.mu.Unlock()
	prompt := &LaunchPrompt{Stack: req.Stack, Servers: req.Servers, Tunnels: req.Tunnels, Keys: names}
	d, _ := c.ask(ConfirmRequest{
		KeyName: strings.Join(names, ", "),
		Client:  ClientInfo{InProcess: true, Purpose: "stack launch", Holder: Holder{Zish: true, Name: "Zish"}},
		Launch:  prompt,
	})
	if !d.Allow {
		return nil, ErrLaunchDenied
	}
	g := &launchGrant{stack: req.Stack, fps: fps, procs: map[procID]bool{}, expires: c.now().Add(LaunchWindow)}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.gen != gen || (c.lock != nil && c.lock.Locked()) {
		return nil, errAgentLocked
	}
	c.launches = append(c.launches, g)
	return &LaunchScope{core: c, g: g}, nil
}

// coveredByLaunch settles a signature a stack approval covers. A forwarded
// agent request never rides on it: it comes from the remote side.
func (c *Core) coveredByLaunch(t target, r signRequest, ev *domain.AgentSignEvent) bool {
	if r.forwarded {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	c.launches = slices.DeleteFunc(c.launches, func(g *launchGrant) bool { return !now.Before(g.expires) })
	for _, g := range c.launches {
		if !g.fps[t.fp] || !g.covers(r.client) {
			continue
		}
		ev.Outcome, ev.Detail = domain.SignGranted, "One approval for the stack "+Label(g.stack)
		return true
	}
	return false
}

func (g *launchGrant) covers(client ClientInfo) bool {
	if client.InProcess {
		return client.Holder.Zish
	}
	for _, p := range client.procs {
		if g.procs[p] {
			return true
		}
	}
	return false
}
