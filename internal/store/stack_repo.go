package store

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/salawat/sshmgr/internal/domain"
)

// StackRepo reads and writes stacks with their steps.
type StackRepo struct {
	db *gorm.DB
}

// NewStackRepo wires the repository to an open database handle.
func NewStackRepo(db *gorm.DB) *StackRepo {
	return &StackRepo{db: db}
}

func orderedSteps(db *gorm.DB) *gorm.DB { return db.Order("position") }

// List returns every stack in sort order, steps in position order.
func (r *StackRepo) List() ([]domain.Stack, error) {
	var stacks []domain.Stack
	err := r.db.Preload("Steps", orderedSteps).Order("sort_order").Order("created_at").Find(&stacks).Error
	if err != nil {
		return nil, fmt.Errorf(
			"cannot read stacks; check the database file is readable and not locked by another instance: %w", err)
	}
	return stacks, nil
}

// Get returns one stack with its steps, or domain.ErrNotFound.
func (r *StackRepo) Get(id string) (*domain.Stack, error) {
	var s domain.Stack
	err := r.db.Preload("Steps", orderedSteps).First(&s, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("cannot read stack %s: %w", id, err)
	}
	return &s, nil
}

// Create inserts a stack and its steps at the end of the sort order. The
// caller supplies the stack ID; step IDs are assigned here.
func (r *StackRepo) Create(s *domain.Stack) error {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var last int
		if err := tx.Model(&domain.Stack{}).Select("COALESCE(MAX(sort_order), -1)").Scan(&last).Error; err != nil {
			return err
		}
		s.SortOrder = last + 1
		// Steps go in separately so GORM never upserts a step's server or
		// forward through the belongs-to associations.
		steps := s.Steps
		s.Steps = nil
		if err := tx.Omit(clause.Associations).Create(s).Error; err != nil {
			return err
		}
		s.Steps = steps
		return insertSteps(tx, s)
	})
	if err != nil {
		return fmt.Errorf(
			"cannot save stack %s; check the database file is writable and not locked by another instance: %w", s.Name, err)
	}
	return nil
}

// Update writes every editable field and replaces the steps. SortOrder and
// LastLaunchedAt are never written here.
func (r *StackRepo) Update(s *domain.Stack) error {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&domain.Stack{}).Where("id = ?", s.ID).Omit(clause.Associations).
			Select("name", "description", "icon", "color", "shortcut", "in_menu_bar", "one_approval", "updated_at").
			Updates(s)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return domain.ErrNotFound
		}
		if err := tx.Where("stack_id = ?", s.ID).Delete(&domain.StackStep{}).Error; err != nil {
			return err
		}
		return insertSteps(tx, s)
	})
	if errors.Is(err, domain.ErrNotFound) {
		return err
	}
	if err != nil {
		return fmt.Errorf(
			"cannot update stack %s; check the database file is writable and not locked by another instance: %w", s.Name, err)
	}
	return nil
}

func insertSteps(tx *gorm.DB, s *domain.Stack) error {
	for i := range s.Steps {
		st := &s.Steps[i]
		st.ID = uuid.NewString()
		st.StackID = s.ID
		st.Position = i
		if err := tx.Omit(clause.Associations).Create(st).Error; err != nil {
			return err
		}
	}
	return nil
}

// Delete removes a stack; its steps cascade.
func (r *StackRepo) Delete(id string) error {
	res := r.db.Delete(&domain.Stack{}, "id = ?", id)
	if res.Error != nil {
		return fmt.Errorf(
			"cannot delete stack %s; check the database file is writable and not locked by another instance: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// DeleteAll removes every stack (factory reset).
func (r *StackRepo) DeleteAll() error {
	return r.db.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.Stack{}).Error
}

// MarkLaunched writes ONLY last_launched_at.
func (r *StackRepo) MarkLaunched(id string, at time.Time) error {
	return r.db.Model(&domain.Stack{}).Where("id = ?", id).UpdateColumn("last_launched_at", at).Error
}
