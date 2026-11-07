package service

import (
	"time"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// CommandService is bound to the frontend as CommandService: saved commands
// per server, run from the server's details, the launcher and the menu-bar
// panel.
type CommandService struct {
	repo     *store.CommandRepo
	servers  *store.ServerRepo
	launcher *LauncherService
}

// CommandInput is what the command form sends. An empty ID creates a command
// for ServerID; otherwise ServerID is ignored.
type CommandInput struct {
	ID        string `json:"id"`
	ServerID  string `json:"serverId"`
	Name      string `json:"name"`
	Command   string `json:"command"`
	InMenuBar bool   `json:"inMenuBar"`
}

// NewCommandService wires the service to its repositories and the launcher
// that opens a command's server.
func NewCommandService(repo *store.CommandRepo, servers *store.ServerRepo, launcher *LauncherService) *CommandService {
	return &CommandService{repo: repo, servers: servers, launcher: launcher}
}

// List returns every saved command, grouped by server.
func (s *CommandService) List() ([]domain.ServerCommand, error) { return s.repo.List() }

// ListFor returns one server's saved commands in order.
func (s *CommandService) ListFor(serverID string) ([]domain.ServerCommand, error) {
	return s.repo.ListFor(serverID)
}

// Save creates or updates a command.
func (s *CommandService) Save(in CommandInput) (*domain.ServerCommand, error) {
	if in.ID != "" {
		c, err := s.repo.Get(in.ID)
		if err != nil {
			return nil, err
		}
		c.Name, c.Command, c.InMenuBar = in.Name, in.Command, in.InMenuBar
		if err := c.Validate(); err != nil {
			return nil, err
		}
		if err := s.repo.Update(c); err != nil {
			return nil, err
		}
		return c, nil
	}
	if _, err := s.servers.Get(in.ServerID); err != nil {
		return nil, err
	}
	n, err := s.repo.CountFor(in.ServerID)
	if err != nil {
		return nil, err
	}
	if n >= domain.MaxServerCommands {
		return nil, domain.NewError(domain.CodeValidation, "A server can have at most 20 saved commands.")
	}
	c := &domain.ServerCommand{ID: uuid.NewString(), ServerID: in.ServerID, Name: in.Name, Command: in.Command, InMenuBar: in.InMenuBar}
	if err := c.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Create(c); err != nil {
		return nil, err
	}
	return c, nil
}

// Delete removes a saved command.
func (s *CommandService) Delete(id string) error { return s.repo.Delete(id) }

// Run opens the command's server in the terminal and runs the command there
// in place of the server's own "run after connect". inTab is the launcher's
// ⌘↵. The shell stays open afterwards, as with "run after connect".
func (s *CommandService) Run(id string, inTab bool) (OpenResult, error) {
	c, err := s.repo.Get(id)
	if err != nil {
		return OpenResult{}, err
	}
	note, err := s.launcher.open(c.ServerID, stepOpen{runCommand: c.Command, inTab: inTab})
	if err != nil {
		return OpenResult{}, err
	}
	_ = s.repo.MarkRun(id, time.Now())
	return OpenResult{Note: note}, nil
}
