package store

import (
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// SessionLogRepo appends and reads the per-server session history behind the
// detail page's "Recent sessions" card.
type SessionLogRepo struct {
	db *gorm.DB
}

// NewSessionLogRepo wires the repository to an open database handle.
func NewSessionLogRepo(db *gorm.DB) *SessionLogRepo {
	return &SessionLogRepo{db: db}
}

// Start records the beginning of a session and returns its log id, which the
// caller hands back to End when the session closes.
func (r *SessionLogRepo) Start(serverID string, at time.Time) (uint, error) {
	log := domain.SessionLog{ServerID: serverID, StartedAt: at}
	if err := r.db.Create(&log).Error; err != nil {
		return 0, fmt.Errorf("cannot record session start: %w", err)
	}
	return log.ID, nil
}

// End stamps a started session with its end time and outcome. A no-op id of 0
// (Start failed) is ignored so a lost start never turns into a bogus update.
func (r *SessionLogRepo) End(id uint, at time.Time, outcome string) error {
	if id == 0 {
		return nil
	}
	err := r.db.Model(&domain.SessionLog{}).
		Where("id = ?", id).
		Updates(map[string]any{"ended_at": at, "outcome": outcome}).Error
	if err != nil {
		return fmt.Errorf("cannot record session end: %w", err)
	}
	return nil
}

// DeleteAll removes every session-history row (factory reset).
func (r *SessionLogRepo) DeleteAll() error {
	return r.db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.SessionLog{}).Error
}

// Recent returns a server's most recent sessions, newest first, capped at limit.
func (r *SessionLogRepo) Recent(serverID string, limit int) ([]domain.SessionLog, error) {
	var logs []domain.SessionLog
	err := r.db.Where("server_id = ?", serverID).
		Order("started_at desc").
		Limit(limit).
		Find(&logs).Error
	if err != nil {
		return nil, fmt.Errorf("cannot read session history: %w", err)
	}
	return logs, nil
}
