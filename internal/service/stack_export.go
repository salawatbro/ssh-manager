package service

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// exportVersion is the export file format: an object with servers, tunnels
// and stacks. Version 1 files are a bare array of servers.
const exportVersion = 2

// ExportFile is the JSON export. Like the servers, tunnels and stacks carry
// no secret: ports, hosts, names and the ids that tie them together.
type ExportFile struct {
	Version  int                  `json:"version"`
	Servers  []domain.Server      `json:"servers"`
	Forwards []domain.PortForward `json:"forwards"`
	Stacks   []domain.Stack       `json:"stacks"`
}

// SetStackDeps lets the JSON export and import carry stacks; onImported runs
// after an import added any. Package-level so it never becomes a frontend
// binding.
func SetStackDeps(s *ServerService, stacks *store.StackRepo, onImported func()) {
	s.stacks, s.onStacksImported = stacks, onImported
}

func (s *ServerService) exportFile() (ExportFile, error) {
	out := ExportFile{Version: exportVersion, Forwards: []domain.PortForward{}, Stacks: []domain.Stack{}}
	var err error
	if out.Servers, err = s.repo.List(); err != nil {
		return out, err
	}
	if s.forwards != nil {
		if out.Forwards, err = s.forwards.ListAll(); err != nil {
			return out, err
		}
	}
	if s.stacks != nil {
		if out.Stacks, err = s.stacks.List(); err != nil {
			return out, err
		}
	}
	return out, nil
}

// ParseExportJSON reads either format and validates every entry (SEC-07: an
// imported file is untrusted). One invalid entry fails the whole parse.
func ParseExportJSON(b []byte) (ExportFile, error) {
	if trimmed := bytes.TrimSpace(b); len(trimmed) > 0 && trimmed[0] == '[' {
		servers, err := ParseServersJSON(b)
		return ExportFile{Version: 1, Servers: servers}, err
	}
	var f ExportFile
	if err := json.Unmarshal(b, &f); err != nil || f.Version < 1 {
		return ExportFile{}, domain.NewError(domain.CodeValidation, "The file is not a Zish export.")
	}
	for i := range f.Servers {
		if err := f.Servers[i].Validate(); err != nil {
			return ExportFile{}, err
		}
	}
	for i := range f.Forwards {
		if err := f.Forwards[i].Validate(); err != nil {
			return ExportFile{}, err
		}
	}
	for i := range f.Stacks {
		if err := f.Stacks[i].Validate(); err != nil {
			return ExportFile{}, err
		}
	}
	return f, nil
}

// importForwards creates the file's tunnels on the servers they map to,
// reusing an identical tunnel already there; it returns old id → new id.
func (s *ServerService) importForwards(in []domain.PortForward, servers map[string]string) (map[string]string, error) {
	ids := map[string]string{}
	if s.forwards == nil {
		return ids, nil
	}
	existing, err := s.forwards.ListAll()
	if err != nil {
		return ids, err
	}
	for _, f := range in {
		srv, ok := servers[f.ServerID]
		if !ok {
			continue
		}
		old := f.ID
		f.ServerID, f.Server = srv, nil
		if same := sameForward(existing, f); same != "" {
			ids[old] = same
			continue
		}
		f.ID = uuid.NewString()
		if err := s.forwards.Create(&f); err != nil {
			return ids, err
		}
		existing = append(existing, f)
		ids[old] = f.ID
	}
	return ids, nil
}

func sameForward(existing []domain.PortForward, f domain.PortForward) string {
	for _, e := range existing {
		if e.ServerID == f.ServerID && e.Type == f.Type && e.BindPort == f.BindPort &&
			e.DestHost == f.DestHost && e.DestPort == f.DestPort {
			return e.ID
		}
	}
	return ""
}

// importStacks creates the file's stacks with their steps remapped. A step
// whose server or tunnel did not come across is dropped, a stack named like
// one already here is skipped, and a shortcut already taken is cleared.
func (s *ServerService) importStacks(in []domain.Stack, servers, forwards map[string]string) error {
	if s.stacks == nil {
		return nil
	}
	existing, err := s.stacks.List()
	if err != nil {
		return err
	}
	taken := map[string]bool{}
	names := map[string]bool{}
	for _, e := range existing {
		taken[e.Shortcut], names[e.Name] = true, true
	}
	for _, st := range in {
		if names[st.Name] {
			continue
		}
		var steps []domain.StackStep
		for _, step := range st.Steps {
			if id, ok := remap(step.ServerID, servers); ok {
				step.ServerID = &id
			} else if id, ok := remap(step.ForwardID, forwards); ok {
				step.ForwardID = &id
			} else {
				continue
			}
			step.Server, step.Forward = nil, nil
			steps = append(steps, step)
		}
		st.ID, st.Steps, st.LastLaunchedAt = uuid.NewString(), steps, nil
		if taken[st.Shortcut] {
			st.Shortcut = ""
		}
		if err := s.stacks.Create(&st); err != nil {
			return fmt.Errorf("cannot import the stack %s: %w", st.Name, err)
		}
		taken[st.Shortcut], names[st.Name] = true, true
	}
	return nil
}

func remap(id *string, ids map[string]string) (string, bool) {
	if id == nil {
		return "", false
	}
	out, ok := ids[*id]
	return out, ok
}
