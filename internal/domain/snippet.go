package domain

import "time"

// SnippetScope controls which servers a snippet is offered for: everywhere,
// one group, or one server.
type SnippetScope string

// The valid snippet scopes.
const (
	ScopeGlobal SnippetScope = "global"
	ScopeGroup  SnippetScope = "group"
	ScopeServer SnippetScope = "server"
)

// Snippet is a saved command a user can run against a server's terminal. It
// carries no secret (SEC-01) — just a name, a body, and where it applies.
type Snippet struct {
	ID        string       `gorm:"primaryKey;type:text" json:"id"`
	Name      string       `gorm:"not null" json:"name"`
	Body      string       `gorm:"not null" json:"body"`
	Scope     SnippetScope `gorm:"not null" json:"scope"`
	ScopeRef  string       `json:"scopeRef"`                       // group name (group scope) / server id (server scope); "" for global
	Slot      int          `gorm:"not null;default:0" json:"slot"` // 0=none, 1..9 quick-run
	CreatedAt time.Time    `json:"createdAt"`
	UpdatedAt time.Time    `json:"updatedAt"`
}

// Validate rejects a malformed snippet.
func (s *Snippet) Validate() error {
	if s.Name == "" {
		return validationError("The snippet needs a name.")
	}
	if s.Body == "" {
		return validationError("The snippet needs a body.")
	}
	switch s.Scope {
	case ScopeGlobal, ScopeGroup, ScopeServer:
	default:
		return validationError("Scope must be global, group, or server.")
	}
	if (s.Scope == ScopeGroup || s.Scope == ScopeServer) && s.ScopeRef == "" {
		return validationError("Group and server scoped snippets need a scope reference.")
	}
	if s.Slot < 0 || s.Slot > 9 {
		return validationError("Slot must be between 0 and 9.")
	}
	return nil
}
