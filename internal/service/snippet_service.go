package service

import (
	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// SnippetInput is what the frontend sends to create or update a saved
// snippet. It mirrors ForwardInput's shape: a plain JSON-tagged struct the
// service turns into a domain.Snippet and validates again (SEC-08).
type SnippetInput struct {
	ID       string              `json:"id"`
	Name     string              `json:"name"`
	Body     string              `json:"body"`
	Scope    domain.SnippetScope `json:"scope"`
	ScopeRef string              `json:"scopeRef"`
	Slot     int                 `json:"slot"`
}

// SnippetService is bound to the frontend as SnippetService. Unlike
// ForwardService it needs no secret store, dialer, or session manager: a
// snippet carries no secret (SEC-01) and does nothing on its own — a
// terminal runs its Body as ordinary keystrokes via SSHService.Write.
type SnippetService struct {
	repo *store.SnippetRepo
}

// NewSnippetService wires the service to its repository.
func NewSnippetService(repo *store.SnippetRepo) *SnippetService {
	return &SnippetService{repo: repo}
}

// List returns every saved snippet (the management view's unfiltered
// catalog — see SnippetRepo.List).
func (s *SnippetService) List() ([]domain.Snippet, error) {
	return s.repo.List()
}

// Create validates the input and stores a new snippet.
func (s *SnippetService) Create(in SnippetInput) (*domain.Snippet, error) {
	sn := in.toSnippet()
	sn.ID = uuid.NewString()

	// SEC-08: the frontend already validated; do it again here anyway.
	if err := sn.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Create(sn); err != nil {
		return nil, err
	}
	return sn, nil
}

// Update overwrites an existing snippet's editable fields.
func (s *SnippetService) Update(in SnippetInput) (*domain.Snippet, error) {
	sn := in.toSnippet()

	if err := sn.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Update(sn); err != nil {
		return nil, err
	}
	return s.repo.Get(sn.ID)
}

// Delete removes a saved snippet definition.
func (s *SnippetService) Delete(id string) error {
	return s.repo.Delete(id)
}

// ApplicableTo returns every snippet that applies to a terminal for
// serverID in groupName (global + matching group + matching server).
func (s *SnippetService) ApplicableTo(serverID, groupName string) ([]domain.Snippet, error) {
	return s.repo.ApplicableTo(serverID, groupName)
}

// BySlot returns the applicable snippet bound to slot for a terminal's
// server/group, or domain.ErrNotFound when none matches.
//
// Slot 0 means "no slot" (domain.Snippet.Slot's own doc: "0=none, 1..9
// quick-run") — a snippet stored with Slot 0 simply isn't offered on any
// ⌘1-9 quick-run key, so there is no key that could ever produce
// BySlot(0, …) from the UI. Rather than let that call silently match the
// first unslotted-but-otherwise-applicable snippet it happens to find,
// BySlot treats any slot outside 1..9 as an automatic non-match: it's the
// same "no such quick-run slot" answer a caller gets for any other slot with
// nothing bound to it.
func (s *SnippetService) BySlot(slot int, serverID, groupName string) (*domain.Snippet, error) {
	if slot < 1 || slot > 9 {
		return nil, domain.ErrNotFound
	}
	applicable, err := s.repo.ApplicableTo(serverID, groupName)
	if err != nil {
		return nil, err
	}
	for i := range applicable {
		if applicable[i].Slot == slot {
			return &applicable[i], nil
		}
	}
	return nil, domain.ErrNotFound
}

// toSnippet maps the input onto a domain snippet. Create overwrites ID with
// a fresh UUID after this call; Update relies on the input carrying the
// existing ID.
func (in SnippetInput) toSnippet() *domain.Snippet {
	return &domain.Snippet{
		ID:       in.ID,
		Name:     in.Name,
		Body:     in.Body,
		Scope:    in.Scope,
		ScopeRef: in.ScopeRef,
		Slot:     in.Slot,
	}
}
