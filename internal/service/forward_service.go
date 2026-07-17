package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/forward"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// ForwardInput is what the frontend sends to create or update a saved port
// forward. It mirrors CreateServerInput's shape: a plain JSON-tagged struct
// the service turns into a domain.PortForward and validates again (SEC-08).
type ForwardInput struct {
	ID       string             `json:"id"`
	ServerID string             `json:"serverId"`
	Name     string             `json:"name"`
	Type     domain.ForwardType `json:"type"`
	BindAddr string             `json:"bindAddr"`
	DestHost string             `json:"destHost"`
	BindPort int                `json:"bindPort"`
	DestPort int                `json:"destPort"`
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
}

// ForwardService is bound to the frontend as ForwardService.
type ForwardService struct {
	repo    *store.ForwardRepo
	servers *store.ServerRepo
	secret  secret.Store
	dialer  Dialer
	mgr     tunnelManager
}

// NewForwardService wires the service to its repositories, the keychain,
// the SSH dialer and the tunnel manager.
func NewForwardService(repo *store.ForwardRepo, servers *store.ServerRepo, sec secret.Store, dialer Dialer, mgr tunnelManager) *ForwardService {
	return &ForwardService{repo: repo, servers: servers, secret: sec, dialer: dialer, mgr: mgr}
}

// List returns every forward saved for serverID.
func (s *ForwardService) List(serverID string) ([]domain.PortForward, error) {
	return s.repo.List(serverID)
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

// Delete removes a saved forward definition.
func (s *ForwardService) Delete(id string) error {
	return s.repo.Delete(id)
}

// Start dials the forward's server (through its full jump chain, if any)
// and starts the tunnel over that connection. Every step propagates its
// error with its original code: an unknown forward or server is
// ERR_NOT_FOUND, a bad jump chain is ERR_JUMP_CYCLE/ERR_JUMP_FAILED, a
// dial failure keeps the dialer's classified code.
//
// On a mgr.Start failure the Manager has already closed conn (see
// forward.Manager.Start's doc comment) — this must not double-close it.
func (s *ForwardService) Start(id string) error {
	fwd, err := s.repo.Get(id)
	if err != nil {
		return err
	}
	srv, err := s.servers.Get(fwd.ServerID)
	if err != nil {
		return err
	}
	chain, err := resolveChain(s.servers, s.secret, srv)
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
	if err := s.mgr.Start(*fwd, conn); err != nil {
		return err // Manager.Start already closed conn on failure
	}
	return nil
}

// Stop tears the tunnel down. Stopping an id that isn't running is a no-op
// (forward.Manager.Stop's contract).
func (s *ForwardService) Stop(id string) error {
	return s.mgr.Stop(id)
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
		ID:       in.ID,
		ServerID: in.ServerID,
		Name:     in.Name,
		Type:     in.Type,
		BindAddr: in.BindAddr,
		BindPort: in.BindPort,
		DestHost: in.DestHost,
		DestPort: in.DestPort,
	}
}
