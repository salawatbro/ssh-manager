package store

import (
	"fmt"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// MaxSignEvents is how many sign-log rows are kept; older ones are pruned on
// insert.
const MaxSignEvents = 500

// SignLogRepo persists the agent's sign log.
type SignLogRepo struct {
	db  *gorm.DB
	max int
}

// NewSignLogRepo wires the repository to an open database handle.
func NewSignLogRepo(db *gorm.DB) *SignLogRepo {
	return &SignLogRepo{db: db, max: MaxSignEvents}
}

// Insert stores ev (setting its ID) and prunes everything past the newest
// MaxSignEvents rows.
func (r *SignLogRepo) Insert(ev *domain.AgentSignEvent) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(ev).Error; err != nil {
			return fmt.Errorf("cannot record the sign event: %w", err)
		}
		keep := tx.Model(&domain.AgentSignEvent{}).Select("id").Order("id DESC").Limit(r.max)
		return tx.Where("id NOT IN (?)", keep).Delete(&domain.AgentSignEvent{}).Error
	})
}

// List returns up to limit events, newest first.
func (r *SignLogRepo) List(limit int) ([]domain.AgentSignEvent, error) {
	if limit <= 0 || limit > r.max {
		limit = r.max
	}
	var evs []domain.AgentSignEvent
	if err := r.db.Order("id DESC").Limit(limit).Find(&evs).Error; err != nil {
		return nil, fmt.Errorf("cannot read the sign log: %w", err)
	}
	return evs, nil
}

// DeleteAll clears the log.
func (r *SignLogRepo) DeleteAll() error {
	return r.db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.AgentSignEvent{}).Error
}
