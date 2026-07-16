package store

import (
	"errors"
	"fmt"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// SettingsRepo persists the single settings row (ID=1).
type SettingsRepo struct {
	db *gorm.DB
}

// NewSettingsRepo wires the repo to the database.
func NewSettingsRepo(db *gorm.DB) *SettingsRepo { return &SettingsRepo{db: db} }

// Get returns the settings row, seeding it with defaults on first run so the
// caller never has to special-case "no row yet".
func (r *SettingsRepo) Get() (*domain.Settings, error) {
	var s domain.Settings
	err := r.db.First(&s, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		def := domain.DefaultSettings()
		if err := r.db.Create(&def).Error; err != nil {
			return nil, fmt.Errorf("cannot seed default settings; check the database is writable: %w", err)
		}
		return &def, nil
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read settings: %w", err)
	}
	return &s, nil
}

// Save writes the settings row (ID forced to 1). Save creates the row if it is
// somehow missing, so it never fails on a fresh database.
func (r *SettingsRepo) Save(s *domain.Settings) error {
	s.ID = 1
	if err := r.db.Save(s).Error; err != nil {
		return fmt.Errorf("cannot save settings; check the database is writable: %w", err)
	}
	return nil
}
