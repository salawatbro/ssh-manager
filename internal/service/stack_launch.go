package service

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
	"github.com/salawat/sshmgr/internal/launcher"
)

// StackLaunch is what one Launch did, for the toast.
type StackLaunch struct {
	Servers int `json:"servers"`
	// Tunnels counts the tunnels this launch started; running ones are skipped.
	Tunnels  int    `json:"tunnels"`
	Terminal string `json:"terminal"`
	// OneApproval: one Touch ID covered the launch.
	OneApproval bool   `json:"oneApproval"`
	Note        string `json:"note"`
}

// StackLaunched is the stack:launched event: a launch the tray or a global
// shortcut started, so the window can show its outcome.
type StackLaunched struct {
	StackID string      `json:"stackId"`
	Result  StackLaunch `json:"result"`
	Error   string      `json:"error"`
}

// launchScope is the slice of *agent.LaunchScope a launch uses.
type launchScope interface {
	Active() bool
	Attach(pid int)
	Close()
}

// stackRunner does the outside work of a launch; tests swap in a fake.
type stackRunner interface {
	locked() bool
	approve(req agent.LaunchRequest) (launchScope, error)
	// startTunnel reports whether it started the tunnel (false: it already ran).
	startTunnel(id string) (bool, error)
	openServer(serverID string, o stepOpen) (string, error)
	terminalName() string
}

// SetStackRuntime wires Launch to the launcher, the tunnels and the agent.
// Package-level so it never becomes a frontend binding.
func SetStackRuntime(s *StackService, l *LauncherService, f *ForwardService, a *AgentService) {
	s.run = &stackRuntime{launcher: l, forwards: f, agent: a}
}

// ErrStackOpening reports a second Launch of a stack that is still opening.
var ErrStackOpening = domain.NewError(domain.CodeValidation, "This stack is still opening.")

// Launch opens a stack: one approval first (when on and needed), then every
// tunnel in order, waiting for each to be up, then the servers in order. A
// tunnel that fails stops the launch before any server opens.
func (s *StackService) Launch(id string) (StackLaunch, error) {
	if s.run == nil {
		return StackLaunch{}, ErrLauncherBusy
	}
	if s.run.locked() {
		return StackLaunch{}, ErrLauncherLocked
	}
	if !s.begin(id) {
		return StackLaunch{}, ErrStackOpening
	}
	defer s.end(id)
	st, err := s.repo.Get(id)
	if err != nil {
		return StackLaunch{}, err
	}
	if len(st.Steps) == 0 {
		return StackLaunch{}, domain.NewError(domain.CodeValidation, "Add a server or a tunnel to this stack first.")
	}
	p, err := s.planLaunch(st)
	if err != nil {
		return StackLaunch{}, err
	}
	var scope launchScope = &agent.LaunchScope{}
	if st.OneApproval {
		if scope, err = s.run.approve(p.request); err != nil {
			return StackLaunch{}, err
		}
	}
	res := StackLaunch{OneApproval: scope.Active(), Terminal: s.run.terminalName()}
	for _, f := range p.tunnels {
		started, err := s.run.startTunnel(f.ID)
		if err != nil {
			scope.Close()
			return res, stepError(err, f.Name+" didn’t start, so the stack stopped there: ")
		}
		if started {
			res.Tunnels++
		}
	}
	var notes []string
	for i, step := range p.servers {
		note, err := s.run.openServer(*step.ServerID, stepOpen{
			placement: step.Placement, first: i == 0, runCommand: step.RunCommand, onRedeem: scope.Attach,
		})
		if err != nil {
			if res.Servers == 0 {
				scope.Close()
			}
			prefix := fmt.Sprintf("%s didn’t open (%d of %d opened): ", p.names[i], res.Servers, len(p.servers))
			return res, stepError(err, prefix)
		}
		res.Servers++
		if note != "" && !slices.Contains(notes, note) {
			notes = append(notes, note)
		}
	}
	res.Note = strings.Join(notes, " ")
	_ = s.repo.MarkLaunched(id, s.now())
	return res, nil
}

func (s *StackService) begin(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.launching[id] {
		return false
	}
	s.launching[id] = true
	return true
}

func (s *StackService) end(id string) {
	s.mu.Lock()
	delete(s.launching, id)
	s.mu.Unlock()
}

// launchPlan is a stack resolved against the database.
type launchPlan struct {
	tunnels []domain.PortForward
	servers []domain.StackStep
	names   []string // server step names, parallel to servers
	request agent.LaunchRequest
}

func (s *StackService) planLaunch(st *domain.Stack) (launchPlan, error) {
	p := launchPlan{request: agent.LaunchRequest{Stack: st.Name}}
	seen := map[string]bool{}
	addKeys := func(target *domain.Server) error {
		chain, err := resolveServers(s.servers, target)
		if err != nil {
			return err
		}
		for _, hop := range chain {
			if hop.AuthType == domain.AuthZishKey && hop.AgentKeyID != nil && !slices.Contains(p.request.KeyIDs, *hop.AgentKeyID) {
				p.request.KeyIDs = append(p.request.KeyIDs, *hop.AgentKeyID)
			}
		}
		return nil
	}
	for _, step := range st.StepsOfKind(domain.StepTunnel) {
		f, err := s.forwards.Get(*step.ForwardID)
		if err != nil {
			return p, err
		}
		srv, err := s.servers.Get(f.ServerID)
		if err != nil {
			return p, err
		}
		if err := addKeys(srv); err != nil {
			return p, err
		}
		p.tunnels = append(p.tunnels, *f)
		p.request.Tunnels = append(p.request.Tunnels, f.Name)
	}
	for _, step := range st.StepsOfKind(domain.StepServer) {
		srv, err := s.servers.Get(*step.ServerID)
		if err != nil {
			return p, err
		}
		if err := addKeys(srv); err != nil {
			return p, err
		}
		p.servers = append(p.servers, step)
		p.names = append(p.names, srv.Name)
		if !seen[srv.ID] {
			seen[srv.ID] = true
			p.request.Servers = append(p.request.Servers, agent.Host{
				Name: srv.Name, Address: srv.User + "@" + srv.Host, Env: string(srv.Environment),
			})
		}
	}
	return p, nil
}

// stepError keeps a coded error's code and puts which step failed in front.
func stepError(err error, prefix string) error {
	var de *domain.Error
	if errors.As(err, &de) {
		return domain.NewError(de.Code, prefix+de.Message)
	}
	return domain.NewError(domain.CodeInternal, prefix+err.Error())
}

// stackRuntime is the real stackRunner.
type stackRuntime struct {
	launcher *LauncherService
	forwards *ForwardService
	agent    *AgentService
}

func (r *stackRuntime) locked() bool { return r.launcher.locked() }

func (r *stackRuntime) approve(req agent.LaunchRequest) (launchScope, error) {
	c := r.agent.rt.core()
	if c == nil {
		return &agent.LaunchScope{}, nil
	}
	return c.ApproveLaunch(req)
}

func (r *stackRuntime) startTunnel(id string) (bool, error) {
	if r.forwards.mgr.Status(id).State == forward.StateRunning {
		return false, nil
	}
	return true, r.forwards.Start(id)
}

func (r *stackRuntime) openServer(serverID string, o stepOpen) (string, error) {
	return r.launcher.open(serverID, o)
}

func (r *stackRuntime) terminalName() string {
	set, err := r.launcher.currentSettings()
	if err != nil {
		return ""
	}
	if set.Terminal == domain.TerminalCustom {
		return "your terminal"
	}
	t, _ := launcher.Lookup(set.Terminal)
	return t.Name
}
