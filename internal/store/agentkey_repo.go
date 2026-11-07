package store

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// ErrKeyNotFound is returned when an agent key lookup finds nothing.
var ErrKeyNotFound = domain.NewError(domain.CodeNotFound, "Key not found.")

// AgentKeyRepo reads and writes the agent keys' public metadata. The private
// keys live in the Keychain only.
type AgentKeyRepo struct {
	db *gorm.DB
}

// NewAgentKeyRepo wires the repository to an open database handle.
func NewAgentKeyRepo(db *gorm.DB) *AgentKeyRepo {
	return &AgentKeyRepo{db: db}
}

// List returns every key, by name.
func (r *AgentKeyRepo) List() ([]domain.AgentKey, error) {
	var keys []domain.AgentKey
	if err := r.db.Order("name COLLATE NOCASE").Find(&keys).Error; err != nil {
		return nil, fmt.Errorf("cannot read the key list: %w", err)
	}
	return keys, nil
}

// Get returns one key by ID, or ErrKeyNotFound.
func (r *AgentKeyRepo) Get(id string) (*domain.AgentKey, error) {
	return r.first("id = ?", id)
}

// GetByFingerprint returns the key with fingerprint fp, or ErrKeyNotFound.
func (r *AgentKeyRepo) GetByFingerprint(fp string) (*domain.AgentKey, error) {
	return r.first("fingerprint = ?", fp)
}

// GetByName returns the key whose name equals name ignoring case, or
// ErrKeyNotFound.
func (r *AgentKeyRepo) GetByName(name string) (*domain.AgentKey, error) {
	return r.first("lower(name) = ?", strings.ToLower(name))
}

func (r *AgentKeyRepo) first(query string, arg any) (*domain.AgentKey, error) {
	var k domain.AgentKey
	err := r.db.First(&k, query, arg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrKeyNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read the key: %w", err)
	}
	return &k, nil
}

// Create inserts a key. The caller supplies the ID.
func (r *AgentKeyRepo) Create(k *domain.AgentKey) error {
	confirm := k.RequireConfirm
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(k).Error; err != nil {
			return err
		}
		if confirm {
			return nil
		}
		// GORM inserts the column default (true) in place of a false.
		k.RequireConfirm = false
		return tx.Model(&domain.AgentKey{}).Where("id = ?", k.ID).UpdateColumn("require_confirm", false).Error
	})
	if err != nil {
		return fmt.Errorf("cannot save key %s: %w", k.ID, err)
	}
	return nil
}

// UpdateName writes only the name column.
func (r *AgentKeyRepo) UpdateName(id, name string) error {
	return r.updateColumn(id, "name", name)
}

// UpdateRequireConfirm writes only the require_confirm column.
func (r *AgentKeyRepo) UpdateRequireConfirm(id string, require bool) error {
	return r.updateColumn(id, "require_confirm", require)
}

// Touch records a use of the key.
func (r *AgentKeyRepo) Touch(id string, at time.Time) error {
	return r.updateColumn(id, "last_used_at", at)
}

func (r *AgentKeyRepo) updateColumn(id, column string, value any) error {
	res := r.db.Model(&domain.AgentKey{}).Where("id = ?", id).UpdateColumn(column, value)
	if res.Error != nil {
		return fmt.Errorf("cannot update key %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrKeyNotFound
	}
	return nil
}

// Delete removes a key row.
func (r *AgentKeyRepo) Delete(id string) error {
	res := r.db.Delete(&domain.AgentKey{}, "id = ?", id)
	if res.Error != nil {
		return fmt.Errorf("cannot delete key %s: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrKeyNotFound
	}
	return nil
}

// DeleteAll removes every key row (factory reset).
func (r *AgentKeyRepo) DeleteAll() error {
	return r.db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.AgentKey{}).Error
}
