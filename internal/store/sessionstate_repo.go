package store

import (
	"encoding/json"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// SessionStateRepo persists the open-tab list behind "Restore sessions on
// launch". Single row (ID 1), same shape as SettingsRepo.
type SessionStateRepo struct {
	db *gorm.DB
}

// NewSessionStateRepo wires the repository to an open database handle.
func NewSessionStateRepo(db *gorm.DB) *SessionStateRepo {
	return &SessionStateRepo{db: db}
}

// SaveOpenTabs replaces the stored open-tab server-id list.
func (r *SessionStateRepo) SaveOpenTabs(serverIDs []string) error {
	if serverIDs == nil {
		serverIDs = []string{}
	}
	data, err := json.Marshal(serverIDs)
	if err != nil {
		return fmt.Errorf("cannot encode open tabs: %w", err)
	}
	if err := r.db.Save(&domain.SessionState{ID: 1, OpenTabs: string(data)}).Error; err != nil {
		return fmt.Errorf("cannot save open tabs: %w", err)
	}
	return nil
}

// LoadOpenTabs returns the stored open-tab server ids, or an empty slice when
// nothing has been saved yet (a fresh install).
func (r *SessionStateRepo) LoadOpenTabs() ([]string, error) {
	var st domain.SessionState
	err := r.db.First(&st, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return []string{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read open tabs: %w", err)
	}
	var ids []string
	if uerr := json.Unmarshal([]byte(st.OpenTabs), &ids); uerr != nil {
		// A corrupt value is treated as "nothing saved" rather than an error the
		// caller cannot act on — restore just opens nothing.
		return []string{}, nil
	}
	return ids, nil
}
