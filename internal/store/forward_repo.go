package store

import (
	"errors"
	"fmt"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// ForwardRepo reads and writes saved port forwards.
type ForwardRepo struct {
	db *gorm.DB
}

// NewForwardRepo wires the repository to an open database handle.
func NewForwardRepo(db *gorm.DB) *ForwardRepo {
	return &ForwardRepo{db: db}
}

// List returns every forward saved for serverID, oldest first.
func (r *ForwardRepo) List(serverID string) ([]domain.PortForward, error) {
	var forwards []domain.PortForward
	err := r.db.Where("server_id = ?", serverID).Order("created_at").Find(&forwards).Error
	if err != nil {
		return nil, fmt.Errorf(
			"cannot read forwards for server %s; check the database file is readable and not locked by another instance: %w", serverID, err)
	}
	return forwards, nil
}

// Get returns one forward by ID, or domain.ErrNotFound.
func (r *ForwardRepo) Get(id string) (*domain.PortForward, error) {
	var f domain.PortForward
	err := r.db.First(&f, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read forward %s: %w", id, err)
	}
	return &f, nil
}

// Create inserts a forward. The caller supplies the ID.
func (r *ForwardRepo) Create(f *domain.PortForward) error {
	if err := r.db.Create(f).Error; err != nil {
		return fmt.Errorf(
			"cannot save forward %s; check the database file is writable and not locked by another instance: %w", f.ID, err)
	}
	return nil
}

// Update writes every editable field of an existing forward.
func (r *ForwardRepo) Update(f *domain.PortForward) error {
	res := r.db.Model(&domain.PortForward{}).
		Where("id = ?", f.ID).
		Select("name", "type", "bind_addr", "bind_port", "dest_host", "dest_port", "updated_at").
		Updates(f)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot update forward %s; check the database file is writable and not locked by another instance: %w", f.ID, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Delete removes a forward by ID.
func (r *ForwardRepo) Delete(id string) error {
	res := r.db.Delete(&domain.PortForward{}, "id = ?", id)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot delete forward %s; check the database file is writable and not locked by another instance: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}
