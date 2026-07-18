package store

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// ServerRepo reads and writes servers.
type ServerRepo struct {
	db *gorm.DB
}

// NewServerRepo wires the repository to an open database handle.
func NewServerRepo(db *gorm.DB) *ServerRepo {
	return &ServerRepo{db: db}
}

// List returns every server, ordered the way the sidebar renders them:
// grouped, then by explicit sort order, then alphabetically (FR-01.5).
func (r *ServerRepo) List() ([]domain.Server, error) {
	var servers []domain.Server
	err := r.db.Order("group_name, sort_order, name COLLATE NOCASE").Find(&servers).Error
	if err != nil {
		return nil, fmt.Errorf(
			"cannot read the server list; check the database file is readable and not locked by another instance: %w", err)
	}
	return servers, nil
}

// Get returns one server by ID, or domain.ErrNotFound.
func (r *ServerRepo) Get(id string) (*domain.Server, error) {
	var s domain.Server
	err := r.db.First(&s, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read server %s: %w", id, err)
	}
	return &s, nil
}

// Create inserts a server. The caller supplies the ID.
func (r *ServerRepo) Create(s *domain.Server) error {
	if err := r.db.Create(s).Error; err != nil {
		return fmt.Errorf(
			"cannot save server %s; check the database file is writable and not locked by another instance: %w", s.ID, err)
	}
	return nil
}

// updatableColumns lists exactly what Update is allowed to write. It
// deliberately EXCLUDES last_used_at, use_count and sort_order: those are
// server-lifecycle state, not form fields, and a connection bump
// (BumpUsage) owns them. Before this exclusion, a form Update carrying a
// stale use_count would clobber a concurrent bump — 30 of 40 lost under a
// stress harness (docs/v0.2-notes.md). id and created_at stay out too.
//
// The explicit list matters beyond that exclusion too. Passing a struct to
// Updates makes GORM skip zero values, so clearing a field (emptying Notes)
// would silently not persist. Select("*") fixes that but then also writes id
// and created_at. Naming the columns avoids both traps; it also implicitly
// keeps the Jump association out of the write, since Select restricts
// Updates to exactly the named columns regardless of what else is populated
// on s.
var updatableColumns = []string{
	"name", "host", "port", "user",
	"auth_type", "key_path", "two_factor", "jump_id",
	"group_name", "environment", "tags", "notes",
	"updated_at",
}

// Update writes every editable field of an existing server.
func (r *ServerRepo) Update(s *domain.Server) error {
	res := r.db.Model(&domain.Server{}).
		Where("id = ?", s.ID).
		Select(updatableColumns).
		Updates(s)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot update server %s; check the database file is writable and not locked by another instance: %w", s.ID, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Delete removes a server by ID.
func (r *ServerRepo) Delete(id string) error {
	res := r.db.Delete(&domain.Server{}, "id = ?", id)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot delete server %s; check the database file is writable and not locked by another instance, and that no other server's jump host still points at it: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// BumpUsage records one connection: use_count++ and last_used_at=now
// (FR-04.5). It writes ONLY those two columns, in a single UPDATE, so it
// never races with a concurrent form Update over any other field. This is
// the sole writer of usage state; Update excludes it deliberately.
func (r *ServerRepo) BumpUsage(id string) error {
	res := r.db.Model(&domain.Server{}).
		Where("id = ?", id).
		UpdateColumns(map[string]any{
			"use_count":    gorm.Expr("use_count + 1"),
			"last_used_at": time.Now(),
		})
	if res.Error != nil {
		return fmt.Errorf(
			"cannot record usage for server %s; check the database file is writable: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// CountByJumpID counts servers that use id as their jump host. Delete uses
// this to enforce ON DELETE RESTRICT with a clear message before touching
// the row (see TestDeleteRefusesWhenAnotherServerJumpsThroughIt).
func (r *ServerRepo) CountByJumpID(id string) (int64, error) {
	var n int64
	err := r.db.Model(&domain.Server{}).Where("jump_id = ?", id).Count(&n).Error
	if err != nil {
		return 0, fmt.Errorf(
			"cannot count servers jumping through %s; check the database file is readable and not locked by another instance: %w", id, err)
	}
	return n, nil
}

// Groups returns the distinct non-empty group names, sorted.
func (r *ServerRepo) Groups() ([]string, error) {
	var groups []string
	err := r.db.Model(&domain.Server{}).
		Distinct().
		Where("group_name <> ''").
		Order("group_name").
		Pluck("group_name", &groups).Error
	if err != nil {
		return nil, fmt.Errorf(
			"cannot read the group list; check the database file is readable and not locked by another instance: %w", err)
	}
	return groups, nil
}
