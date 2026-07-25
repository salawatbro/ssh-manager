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

// Save writes the settings row (ID forced to 1). Against an empty table gorm
// falls back to an INSERT, so Save never fails on a fresh database — but it does
// not write the row faithfully there: an INSERT omits every field with a
// `gorm:"default:…"` tag whose Go value is the zero value, so a false or 0 is
// silently replaced by the column default. Both production callers Get() first
// (SettingsService.Get's backfill works on the row it just read, and Update's
// first statement is a Get), so a Save always lands as an UPDATE and writes
// what it was given. A caller that Saves into an empty table must Get() first.
func (r *SettingsRepo) Save(s *domain.Settings) error {
	s.ID = 1
	if err := r.db.Save(s).Error; err != nil {
		return fmt.Errorf("cannot save settings; check the database is writable: %w", err)
	}
	return nil
}
