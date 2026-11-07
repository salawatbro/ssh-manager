package service

import (
	"io/fs"
	"os"
	"slices"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// SecurityReport is the Security page: ten checks over Zish's own data.
type SecurityReport struct {
	Score     int             `json:"score"` // passing checks
	Total     int             `json:"total"`
	Checks    []SecurityCheck `json:"checks"`
	CheckedAt time.Time       `json:"checkedAt"`
}

// SecurityCheck is one check. Items name what failed; Notes are plain facts
// shown next to them.
type SecurityCheck struct {
	ID      string         `json:"id"`
	OK      bool           `json:"ok"`
	Ignored bool           `json:"ignored"`
	Title   string         `json:"title"`
	Detail  string         `json:"detail"`
	Items   []SecurityItem `json:"items"`
	Notes   []string       `json:"notes"`
}

// SecurityItem is a server or key a failing check names.
type SecurityItem struct {
	Kind string `json:"kind"` // "server" | "key"
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Item kinds.
const (
	SecurityItemServer = "server"
	SecurityItemKey    = "key"
)

// Narrow views of the repos and services the check reads.
type (
	serverLister interface {
		List() ([]domain.Server, error)
	}
	agentKeyLister interface {
		List() ([]domain.AgentKey, error)
	}
	settingsReader interface {
		Get() (*domain.Settings, error)
	}
	pinChecker   interface{ HasPin() bool }
	agentWatcher interface{ Status() AgentStatus }
)

// KnownHosts answers whether ~/.ssh/known_hosts has a key for a host
// (*sshx.Verifier). It must never write the file.
type KnownHosts interface {
	Known(hostport string) bool
}

// SecurityService runs the Security check. It reads only local state: no
// server is contacted. Bound to the frontend as SecurityService.
type SecurityService struct {
	servers  serverLister
	keys     agentKeyLister
	settings settingsReader
	pin      pinChecker
	agent    agentWatcher
	known    KnownHosts

	lstat func(string) (fs.FileInfo, error)
	mine  func(fs.FileInfo) bool
	now   func() time.Time
}

// NewSecurityService wires the check to the stores and services it reads.
func NewSecurityService(servers serverLister, keys agentKeyLister, settings settingsReader, pin pinChecker, agent agentWatcher, known KnownHosts) *SecurityService {
	return &SecurityService{
		servers: servers, keys: keys, settings: settings, pin: pin, agent: agent, known: known,
		lstat: os.Lstat, mine: ownedByMe, now: time.Now,
	}
}

// Run checks everything again and returns the report.
func (s *SecurityService) Run() (*SecurityReport, error) {
	f, err := s.gather()
	if err != nil {
		return nil, err
	}
	return buildReport(f), nil
}

// securityFacts is everything the checks look at, gathered once per run.
type securityFacts struct {
	servers  []domain.Server
	keys     []domain.AgentKey
	settings domain.Settings
	hasPin   bool
	socket   socketFacts
	known    func(hostport string) bool
	now      time.Time
}

// socketFacts describe the agent socket when Zish serves it.
type socketFacts struct {
	served   bool
	path     string
	statErr  error
	isSocket bool
	perm     fs.FileMode
	mine     bool
}

func (s *SecurityService) gather() (*securityFacts, error) {
	servers, err := s.servers.List()
	if err != nil {
		return nil, err
	}
	keys, err := s.keys.List()
	if err != nil {
		return nil, err
	}
	settings, err := s.settings.Get()
	if err != nil {
		return nil, err
	}
	f := &securityFacts{
		servers: servers, keys: keys, settings: *settings,
		hasPin: s.pin.HasPin(), known: s.known.Known, now: s.now(),
	}
	f.socket = s.socketFacts(s.agent.Status())
	return f, nil
}

func (s *SecurityService) socketFacts(st AgentStatus) socketFacts {
	sf := socketFacts{served: st.Running && st.SocketPath != "", path: st.SocketPath}
	if !sf.served {
		return sf
	}
	fi, err := s.lstat(sf.path)
	if err != nil {
		sf.statErr = err
		return sf
	}
	sf.isSocket = fi.Mode().Type() == fs.ModeSocket
	sf.perm = fi.Mode().Perm()
	sf.mine = s.mine(fi)
	return sf
}

var securityChecks = map[string]func(*securityFacts) SecurityCheck{
	domain.CheckPasswordServers: checkPasswordServers,
	domain.CheckKeysTouchID:     checkKeysTouchID,
	domain.CheckKeyAge:          checkKeyAge,
	domain.CheckRSAKeys:         checkRSAKeys,
	domain.CheckProdTwoFactor:   checkProdTwoFactor,
	domain.CheckAppLock:         checkAppLock,
	domain.CheckIdleLock:        checkIdleLock,
	domain.CheckKnownHosts:      checkKnownHosts,
	domain.CheckAgentSocket:     checkAgentSocket,
	domain.CheckJumpKeys:        checkJumpKeys,
}

func buildReport(f *securityFacts) *SecurityReport {
	ignored := domain.SplitCheckIDs(f.settings.SecurityIgnored)
	r := &SecurityReport{Total: len(domain.SecurityCheckIDs), CheckedAt: f.now, Checks: make([]SecurityCheck, 0, len(domain.SecurityCheckIDs))}
	for _, id := range domain.SecurityCheckIDs {
		c := securityChecks[id](f)
		c.Ignored = !c.OK && slices.Contains(ignored, id)
		if c.OK {
			r.Score++
		}
		r.Checks = append(r.Checks, c)
	}
	return r
}
