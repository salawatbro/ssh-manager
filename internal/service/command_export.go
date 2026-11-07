package service

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// SetCommandDeps lets the JSON export and import carry saved commands.
// Package-level so it never becomes a frontend binding.
func SetCommandDeps(s *ServerService, commands *store.CommandRepo) { s.commands = commands }

// importCommands adds the file's commands to the servers they map to. One
// already there with the same name and text is skipped, and a server keeps
// at most MaxServerCommands.
func (s *ServerService) importCommands(in []domain.ServerCommand, servers map[string]string) error {
	if s.commands == nil || len(in) == 0 {
		return nil
	}
	existing, err := s.commands.List()
	if err != nil {
		return err
	}
	have := map[string]bool{}
	count := map[string]int{}
	for _, c := range existing {
		have[c.ServerID+"\x00"+c.Name+"\x00"+c.Command] = true
		count[c.ServerID]++
	}
	for _, c := range in {
		srv, ok := servers[c.ServerID]
		if !ok {
			continue
		}
		key := srv + "\x00" + c.Name + "\x00" + c.Command
		if have[key] || count[srv] >= domain.MaxServerCommands {
			continue
		}
		c.ID, c.ServerID, c.Server, c.LastRunAt = uuid.NewString(), srv, nil, nil
		if err := s.commands.Create(&c); err != nil {
			return fmt.Errorf("cannot import the command %s: %w", c.Name, err)
		}
		have[key] = true
		count[srv]++
	}
	return nil
}
