package store

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/salawat/sshmgr/internal/domain"
)

// CommandRepo reads and writes saved server commands.
type CommandRepo struct {
	db *gorm.DB
}

// NewCommandRepo wires the repository to an open database handle.
func NewCommandRepo(db *gorm.DB) *CommandRepo {
	return &CommandRepo{db: db}
}

// List returns every saved command, grouped by server in position order.
func (r *CommandRepo) List() ([]domain.ServerCommand, error) {
	var cmds []domain.ServerCommand
	if err := r.db.Order("server_id").Order("position").Order("created_at").Find(&cmds).Error; err != nil {
		return nil, fmt.Errorf(
			"cannot read saved commands; check the database file is readable and not locked by another instance: %w", err)
	}
	return cmds, nil
}

// ListFor returns one server's saved commands in position order.
func (r *CommandRepo) ListFor(serverID string) ([]domain.ServerCommand, error) {
	var cmds []domain.ServerCommand
	if err := r.db.Where("server_id = ?", serverID).Order("position").Order("created_at").Find(&cmds).Error; err != nil {
		return nil, fmt.Errorf("cannot read the saved commands of server %s: %w", serverID, err)
	}
	return cmds, nil
}

// Get returns one saved command, or domain.ErrNotFound.
func (r *CommandRepo) Get(id string) (*domain.ServerCommand, error) {
	var c domain.ServerCommand
	err := r.db.First(&c, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read saved command %s: %w", id, err)
	}
	return &c, nil
}

// CountFor counts one server's saved commands.
func (r *CommandRepo) CountFor(serverID string) (int64, error) {
	var n int64
	if err := r.db.Model(&domain.ServerCommand{}).Where("server_id = ?", serverID).Count(&n).Error; err != nil {
		return 0, fmt.Errorf("cannot count the saved commands of server %s: %w", serverID, err)
	}
	return n, nil
}

// Create inserts a command after its server's last one. The caller supplies
// the ID.
func (r *CommandRepo) Create(c *domain.ServerCommand) error {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var last int
		err := tx.Model(&domain.ServerCommand{}).Where("server_id = ?", c.ServerID).
			Select("COALESCE(MAX(position), -1)").Scan(&last).Error
		if err != nil {
			return err
		}
		c.Position = last + 1
		return tx.Omit(clause.Associations).Create(c).Error
	})
	if err != nil {
		return fmt.Errorf("cannot save the command; check the database file is writable: %w", err)
	}
	return nil
}

// Update writes a command's name, text and menu-bar flag.
func (r *CommandRepo) Update(c *domain.ServerCommand) error {
	res := r.db.Model(&domain.ServerCommand{}).Where("id = ?", c.ID).
		Select("name", "command", "in_menu_bar", "updated_at").Updates(c)
	if res.Error != nil {
		return fmt.Errorf("cannot save command %s; check the database file is writable: %w", c.ID, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// Delete removes one saved command.
func (r *CommandRepo) Delete(id string) error {
	res := r.db.Delete(&domain.ServerCommand{}, "id = ?", id)
	if res.Error != nil {
		return fmt.Errorf("cannot delete command %s; check the database file is writable: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// MarkRun stamps when the command last ran; nothing else changes.
func (r *CommandRepo) MarkRun(id string, at time.Time) error {
	return r.db.Model(&domain.ServerCommand{}).Where("id = ?", id).UpdateColumn("last_run_at", at).Error
}
