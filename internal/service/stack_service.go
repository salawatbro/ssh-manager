package service

import (
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// StackStepInput is one step as the stack sheet sends it.
type StackStepInput struct {
	Kind       domain.StepKind  `json:"kind"`
	ServerID   string           `json:"serverId"`
	ForwardID  string           `json:"forwardId"`
	Placement  domain.Placement `json:"placement"`
	RunCommand string           `json:"runCommand"`
}

// StackInput is what the frontend sends to create or update a stack. Update
// replaces every field and every step.
type StackInput struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Icon        string           `json:"icon"`
	Color       string           `json:"color"`
	Shortcut    string           `json:"shortcut"`
	InMenuBar   bool             `json:"inMenuBar"`
	OneApproval bool             `json:"oneApproval"`
	Steps       []StackStepInput `json:"steps"`
}

// StackService keeps stacks and launches them. Bound to the frontend as
// StackService.
type StackService struct {
	repo     *store.StackRepo
	servers  *store.ServerRepo
	forwards *store.ForwardRepo
	now      func() time.Time

	// run is nil until SetStackRuntime; Launch then reports the launcher busy.
	run      stackRunner
	onChange func()
	// settings is nil in tests that never set a launcher shortcut.
	settings *store.SettingsRepo

	mu        sync.Mutex
	launching map[string]bool
}

// NewStackService wires the service to its repositories.
func NewStackService(repo *store.StackRepo, servers *store.ServerRepo, forwards *store.ForwardRepo) *StackService {
	return &StackService{repo: repo, servers: servers, forwards: forwards, now: time.Now, launching: map[string]bool{}}
}

// SetOnStacksChanged registers fn to run after a stack is created, changed or
// deleted (the tray menu and the global shortcuts follow). Package-level so
// it never becomes a frontend binding.
func SetOnStacksChanged(s *StackService, fn func()) { s.onChange = fn }

// SetStackSettings lets a stack refuse the launcher's shortcut. Package-level
// so it never becomes a frontend binding.
func SetStackSettings(s *StackService, settings *store.SettingsRepo) { s.settings = settings }

func (s *StackService) changed() {
	if s.onChange != nil {
		s.onChange()
	}
}

// List returns every stack in sort order, with steps.
func (s *StackService) List() ([]domain.Stack, error) { return s.repo.List() }

// Create saves a new stack.
func (s *StackService) Create(in StackInput) (*domain.Stack, error) {
	st, err := s.checked(in, "")
	if err != nil {
		return nil, err
	}
	st.ID = uuid.NewString()
	if err := s.repo.Create(st); err != nil {
		return nil, err
	}
	s.changed()
	return s.repo.Get(st.ID)
}

// Update replaces every field and step of a stack.
func (s *StackService) Update(id string, in StackInput) (*domain.Stack, error) {
	st, err := s.checked(in, id)
	if err != nil {
		return nil, err
	}
	st.ID = id
	if err := s.repo.Update(st); err != nil {
		return nil, err
	}
	s.changed()
	return s.repo.Get(id)
}

// Delete removes a stack.
func (s *StackService) Delete(id string) error {
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	s.changed()
	return nil
}

// checked builds and validates the stack, and checks every step points at a
// saved server or tunnel and the shortcut is free.
func (s *StackService) checked(in StackInput, selfID string) (*domain.Stack, error) {
	st := in.toStack()
	if err := st.Validate(); err != nil {
		return nil, err
	}
	for _, step := range st.Steps {
		var err error
		if step.Kind == domain.StepServer {
			_, err = s.servers.Get(*step.ServerID)
		} else {
			_, err = s.forwards.Get(*step.ForwardID)
		}
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.NewError(domain.CodeValidation, "A step points at a server or tunnel that no longer exists. Choose it again.")
		}
		if err != nil {
			return nil, err
		}
	}
	if st.Shortcut == "" {
		return st, nil
	}
	if s.settings != nil {
		set, err := s.settings.Get()
		if err != nil {
			return nil, err
		}
		if set.LauncherHotkey == st.Shortcut {
			return nil, domain.NewError(domain.CodeValidation,
				ShortcutLabel(st.Shortcut)+" opens the launcher. Pick another shortcut.")
		}
	}
	all, err := s.repo.List()
	if err != nil {
		return nil, err
	}
	for _, other := range all {
		if other.ID != selfID && other.Shortcut == st.Shortcut {
			return nil, domain.NewError(domain.CodeValidation,
				ShortcutLabel(st.Shortcut)+" already launches "+other.Name+". Pick another shortcut.")
		}
	}
	return st, nil
}

func (in StackInput) toStack() *domain.Stack {
	st := &domain.Stack{
		Name: in.Name, Description: in.Description, Icon: in.Icon, Color: in.Color,
		Shortcut: in.Shortcut, InMenuBar: in.InMenuBar, OneApproval: in.OneApproval,
	}
	for _, step := range in.Steps {
		out := domain.StackStep{Kind: step.Kind, Placement: step.Placement, RunCommand: step.RunCommand}
		if id := strings.TrimSpace(step.ServerID); id != "" {
			out.ServerID = &id
		}
		if id := strings.TrimSpace(step.ForwardID); id != "" {
			out.ForwardID = &id
		}
		st.Steps = append(st.Steps, out)
	}
	return st
}

// ShortcutLabel spells a canonical shortcut the macOS way: "alt+cmd+1" is
// "⌥⌘1".
func ShortcutLabel(sc string) string {
	sym := map[string]string{"ctrl": "⌃", "alt": "⌥", "shift": "⇧", "cmd": "⌘", domain.ShortcutSpace: "Space"}
	var b strings.Builder
	for part := range strings.SplitSeq(sc, "+") {
		if s, ok := sym[part]; ok {
			b.WriteString(s)
		} else {
			b.WriteString(strings.ToUpper(part))
		}
	}
	return b.String()
}
