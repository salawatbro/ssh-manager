package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// ForwardInput is what the frontend sends to create or update a saved port
// forward. It mirrors CreateServerInput's shape: a plain JSON-tagged struct
// the service turns into a domain.PortForward and validates again (SEC-08).
type ForwardInput struct {
	ID        string             `json:"id"`
	ServerID  string             `json:"serverId"`
	Name      string             `json:"name"`
	Type      domain.ForwardType `json:"type"`
	BindAddr  string             `json:"bindAddr"`
	DestHost  string             `json:"destHost"`
	BindPort  int                `json:"bindPort"`
	DestPort  int                `json:"destPort"`
	Icon      string             `json:"icon"`
	Color     string             `json:"color"`
	AutoStart bool               `json:"autoStart"`
	Reconnect bool               `json:"reconnect"`
}

// PortCheck answers whether a tunnel could listen on a port of this Mac and,
// when not, who holds it and the next port that is free.
type PortCheck struct {
	Free    bool   `json:"free"`
	Owner   string `json:"owner"`
	Suggest int    `json:"suggest"`
}

// TunnelRow is one line of the Tunnels page: a saved forward, the name of the
// server it runs on, its last status and its recent traffic.
type TunnelRow struct {
	Forward    domain.PortForward `json:"forward"`
	ServerName string             `json:"serverName"`
	Status     forward.Status     `json:"status"`
	Traffic    forward.Traffic    `json:"traffic"`
}

// tunnelManager is the slice of *forward.Manager the service needs.
// Narrowing it to an interface lets the service test inject a double
// instead of standing up a real listener/SSH connection — the same
// reasoning as the Dialer interface in server_service.go. *forward.Manager
// satisfies this exactly.
type tunnelManager interface {
	Start(fwd domain.PortForward, conn *sshx.Conn) error
	Stop(id string) error
	Running() []forward.Status
	Status(id string) forward.Status
	Statuses() []forward.Status
	ReportIdle(id string, state forward.State, detail string) bool
	ProbeAll()
	Tick() []forward.Traffic
	Traffic() []forward.Traffic
}

// var _ tunnelManager = (*forward.Manager)(nil) locks the interface/impl
// match at compile time, instead of only where main.go happens to wire them.
var _ tunnelManager = (*forward.Manager)(nil)

// ForwardService is bound to the frontend as ForwardService.
type ForwardService struct {
	repo     *store.ForwardRepo
	servers  *store.ServerRepo
	secret   secret.Store
	dialer   Dialer
	mgr      tunnelManager
	agent    *AgentService
	keeper   *tunnelKeeper
	settings *store.SettingsRepo
}

// SetForwardSettings lets the tunnel runtime follow Settings › Tunnels.
// Package-level so it never becomes a frontend binding.
func SetForwardSettings(s *ForwardService, settings *store.SettingsRepo) { s.settings = settings }

// tunnelSettings is the current settings, or the defaults when none are wired
// or the read fails.
func (s *ForwardService) tunnelSettings() domain.Settings {
	if s.settings != nil {
		if cur, err := s.settings.Get(); err == nil {
			return *cur
		}
	}
	return domain.DefaultSettings()
}

// NewForwardService wires the service to its repositories, the keychain,
// the SSH dialer and the tunnel manager.
func NewForwardService(repo *store.ForwardRepo, servers *store.ServerRepo, sec secret.Store, dialer Dialer, mgr tunnelManager) *ForwardService {
	s := &ForwardService{repo: repo, servers: servers, secret: sec, dialer: dialer, mgr: mgr}
	k := newTunnelKeeper()
	k.start = s.startForward
	k.stop = mgr.Stop
	k.wants = func(id string) bool {
		fwd, err := repo.Get(id)
		return err == nil && fwd.Reconnect && s.tunnelSettings().TunnelsReconnect
	}
	k.report = func(id string, state forward.State, detail string) { mgr.ReportIdle(id, state, detail) }
	k.probeAll = mgr.ProbeAll
	s.keeper = k
	return s
}

// List returns every forward saved for serverID.
func (s *ForwardService) List(serverID string) ([]domain.PortForward, error) {
	return s.repo.List(serverID)
}

// ListAll returns every saved tunnel with its server's name, status and
// traffic, for the Tunnels page.
func (s *ForwardService) ListAll() ([]TunnelRow, error) {
	forwards, err := s.repo.ListAll()
	if err != nil {
		return nil, err
	}
	servers, err := s.servers.List()
	if err != nil {
		return nil, err
	}
	names := make(map[string]string, len(servers))
	for _, srv := range servers {
		names[srv.ID] = srv.Name
	}
	statuses := map[string]forward.Status{}
	for _, st := range s.mgr.Statuses() {
		statuses[st.ForwardID] = st
	}
	traffic := map[string]forward.Traffic{}
	for _, tr := range s.mgr.Traffic() {
		traffic[tr.ForwardID] = tr
	}
	rows := make([]TunnelRow, 0, len(forwards))
	for _, f := range forwards {
		st, ok := statuses[f.ID]
		if !ok {
			st = forward.Status{ForwardID: f.ID, State: forward.StateStopped}
		}
		tr, ok := traffic[f.ID]
		if !ok {
			tr = forward.Traffic{ForwardID: f.ID, Buckets: make([]int64, forward.TrafficBuckets)}
		}
		rows = append(rows, TunnelRow{Forward: f, ServerName: names[f.ServerID], Status: st, Traffic: tr})
	}
	return rows, nil
}

// Create validates the input and stores a new forward.
func (s *ForwardService) Create(in ForwardInput) (*domain.PortForward, error) {
	fwd := in.toPortForward()
	fwd.ID = uuid.NewString()

	// SEC-08: the frontend already validated; do it again here anyway.
	if err := fwd.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Create(fwd); err != nil {
		return nil, err
	}
	return fwd, nil
}

// Update overwrites an existing forward's editable fields.
func (s *ForwardService) Update(in ForwardInput) (*domain.PortForward, error) {
	fwd := in.toPortForward()

	if err := fwd.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Update(fwd); err != nil {
		return nil, err
	}
	return s.repo.Get(fwd.ID)
}

// SetLook changes only a forward's icon and colour, with the same rules as a
// form save.
func (s *ForwardService) SetLook(id, icon, color string) error {
	fwd, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	fwd.Icon, fwd.Color = icon, color
	if err := fwd.Validate(); err != nil {
		return err
	}
	return s.repo.SetLook(id, fwd.Icon, fwd.Color)
}

// Delete removes a saved forward definition. It first stops any running tunnel
// for this id — otherwise deleting the definition would orphan the live tunnel,
// which keeps forwarding traffic until the app quits with no row left to stop
// it from. Stop is a no-op when nothing is running (Manager.Stop's contract).
func (s *ForwardService) Delete(id string) error {
	_ = s.Stop(id)
	return s.repo.Delete(id)
}

// Start dials the forward's server (through its full jump chain, if any)
// and starts the tunnel over that connection. Every step propagates its
// error with its original code: an unknown forward or server is
// ERR_NOT_FOUND, a bad jump chain is ERR_JUMP_CYCLE/ERR_JUMP_FAILED, a
// dial failure keeps the dialer's classified code.
//
// The already-running check happens BEFORE the dial, not after: dialing is
// a full jump-chain SSH handshake, and Manager.Start's "already running"
// branch never touches (let alone closes) conn — per its doc comment,
// ownership only transfers to the Manager once Start actually accepts the
// forward. Dialing first and then hitting that branch would leak the freshly
// authenticated connection, since nothing would ever close it. Checking
// Status first avoids the wasted dial entirely.
//
// This has a benign TOCTOU: two concurrent Starts for the same id could both
// pass the guard and both dial. That's acceptable for a single-user desktop
// UI — the second one still fails, in mgr.Start, without leaking (see
// below) — so no locking is added here for it.
func (s *ForwardService) Start(id string) error {
	if s.keeper.forget(id) {
		// A manual start replaces a pending reconnect.
		s.mgr.ReportIdle(id, forward.StateStopped, "")
	}
	return s.startForward(id)
}

// startForward is Start without touching the reconnect queue; the keeper
// calls it for its own attempts.
func (s *ForwardService) startForward(id string) error {
	fwd, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	if s.mgr.Status(id).State == forward.StateRunning {
		return domain.NewError(domain.CodeValidation, "This forward is already running.")
	}
	srv, err := s.servers.Get(fwd.ServerID)
	if err != nil {
		return err
	}
	chain, err := resolveChain(s.servers, s.secret, s.agent.signers(), srv, "tunnel "+fwd.Name)
	if err != nil {
		return err
	}
	conn, err := s.dialer.DialChain(context.Background(), chain)
	// SEC-10: do not keep the plaintext secrets around after dialing,
	// whether it succeeded or not.
	zeroChainCreds(chain)
	if err != nil {
		return err
	}
	// The guard above already covers the "already running" branch of
	// Manager.Start, which is the one case where it does not take
	// ownership of conn. Every other failure here (e.g. listen failure)
	// does close conn per Manager.Start's doc comment, so this must not
	// double-close it.
	if err := s.mgr.Start(*fwd, conn); err != nil {
		return err
	}
	return nil
}

// Stop tears the tunnel down, or cancels its pending reconnect. Stopping an id
// that is neither is a no-op (forward.Manager.Stop's contract).
func (s *ForwardService) Stop(id string) error {
	if s.keeper.forget(id) {
		s.mgr.ReportIdle(id, forward.StateStopped, "")
	}
	return s.mgr.Stop(id)
}

// StopAll stops every running tunnel and every pending reconnect.
func (s *ForwardService) StopAll() {
	ids := s.keeper.waiting()
	for _, st := range s.mgr.Running() {
		ids = append(ids, st.ForwardID)
	}
	for _, id := range ids {
		_ = s.Stop(id)
	}
}

// UsePort moves a tunnel's listener on this Mac to port and starts it — the
// busy-port row's "Use N instead".
func (s *ForwardService) UsePort(id string, port int) error {
	fwd, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	if fwd.Type == domain.ForwardRemote {
		return domain.NewError(domain.CodeValidation, "A remote tunnel listens on the server, not on this Mac.")
	}
	fwd.BindPort = port
	if err := fwd.Validate(); err != nil {
		return err
	}
	if err := s.repo.Update(fwd); err != nil {
		return err
	}
	return s.Start(id)
}

// CheckPort tests 127.0.0.1:port the way a tunnel would bind it.
func (s *ForwardService) CheckPort(port int) (*PortCheck, error) {
	if port < 1 || port > 65535 {
		return nil, domain.NewError(domain.CodeValidation, "The port must be between 1 and 65535.")
	}
	if platform.PortFree(port) {
		return &PortCheck{Free: true}, nil
	}
	return &PortCheck{Owner: platform.PortOwner(port), Suggest: platform.NextFreePort(port)}, nil
}

// Statuses lists every currently-running tunnel.
func (s *ForwardService) Statuses() []forward.Status {
	return s.mgr.Running()
}

// toPortForward maps the input onto a domain forward. ServerID and ID come
// straight from the input — Create overwrites ID with a fresh UUID after
// this call; Update relies on the input carrying the existing ID.
func (in ForwardInput) toPortForward() *domain.PortForward {
	return &domain.PortForward{
		ID:        in.ID,
		ServerID:  in.ServerID,
		Name:      in.Name,
		Type:      in.Type,
		BindAddr:  in.BindAddr,
		BindPort:  in.BindPort,
		DestHost:  in.DestHost,
		DestPort:  in.DestPort,
		Icon:      in.Icon,
		Color:     in.Color,
		AutoStart: in.AutoStart,
		Reconnect: in.Reconnect,
	}
}
