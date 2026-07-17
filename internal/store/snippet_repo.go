package store

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/salawat/sshmgr/internal/domain"
)

// SnippetRepo reads and writes saved snippets.
type SnippetRepo struct {
	db *gorm.DB
}

// NewSnippetRepo wires the repository to an open database handle.
func NewSnippetRepo(db *gorm.DB) *SnippetRepo {
	return &SnippetRepo{db: db}
}

// List returns every saved snippet, ordered slot then name. Unlike
// ForwardRepo.List, this takes no serverID: snippets are filtered by scope
// via ApplicableTo, not by owner, so List is the unfiltered catalog a
// management UI (Task 9) reads and edits directly.
func (r *SnippetRepo) List() ([]domain.Snippet, error) {
	var snippets []domain.Snippet
	err := r.db.Order("slot, name").Find(&snippets).Error
	if err != nil {
		return nil, fmt.Errorf(
			"cannot read snippets; check the database file is readable and not locked by another instance: %w", err)
	}
	return snippets, nil
}

// Get returns one snippet by ID, or domain.ErrNotFound.
func (r *SnippetRepo) Get(id string) (*domain.Snippet, error) {
	var s domain.Snippet
	err := r.db.First(&s, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read snippet %s: %w", id, err)
	}
	return &s, nil
}

// Create inserts a snippet. The caller supplies the ID.
//
// Omit(clause.Associations) mirrors ForwardRepo.Create even though Snippet
// has no association today: it keeps the two repos identical in shape, and
// if a Snippet field ever grows a belongs-to (e.g. an optional Server), this
// guard is already in place rather than needing someone to remember to add
// it under time pressure.
func (r *SnippetRepo) Create(s *domain.Snippet) error {
	if err := r.db.Omit(clause.Associations).Create(s).Error; err != nil {
		return fmt.Errorf(
			"cannot save snippet %s; check the database file is writable and not locked by another instance: %w", s.ID, err)
	}
	return nil
}

// Update writes every editable field of an existing snippet.
func (r *SnippetRepo) Update(s *domain.Snippet) error {
	res := r.db.Model(&domain.Snippet{}).
		Where("id = ?", s.ID).
		Select("name", "body", "scope", "scope_ref", "slot", "updated_at").
		Updates(s)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot update snippet %s; check the database file is writable and not locked by another instance: %w", s.ID, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Delete removes a snippet by ID.
func (r *SnippetRepo) Delete(id string) error {
	res := r.db.Delete(&domain.Snippet{}, "id = ?", id)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot delete snippet %s; check the database file is writable and not locked by another instance: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ApplicableTo returns every snippet that applies to a terminal for
// serverID in groupName: every global snippet, plus any snippet scoped to
// groupName or to serverID specifically — ordered slot, name.
func (r *SnippetRepo) ApplicableTo(serverID, groupName string) ([]domain.Snippet, error) {
	var out []domain.Snippet
	err := r.db.Where(
		"scope = ? OR (scope = ? AND scope_ref = ?) OR (scope = ? AND scope_ref = ?)",
		domain.ScopeGlobal, domain.ScopeGroup, groupName, domain.ScopeServer, serverID,
	).Order("slot, name").Find(&out).Error
	return out, err
}
