package service

import (
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// LoginAgent toggles the OS "start at login" registration. It is an interface
// so the service stays cgo-free and testable; the production implementation
// (platform.LoginAgent) writes a macOS LaunchAgent plist, and a nil agent (in
// tests, or on an unsupported OS) makes StartAtLogin a stored-only flag.
type LoginAgent interface {
	Set(enabled bool) error
}

// SettingsService is bound to the frontend as SettingsService.
type SettingsService struct {
	repo  *store.SettingsRepo
	login LoginAgent
}

// NewSettingsService wires the service to the settings repo and (optionally) a
// login agent for the start-at-login side effect.
func NewSettingsService(repo *store.SettingsRepo, login LoginAgent) *SettingsService {
	return &SettingsService{repo: repo, login: login}
}

// Get returns the current settings, sanitised.
func (s *SettingsService) Get() (*domain.Settings, error) {
	cur, err := s.repo.Get()
	if err != nil {
		return nil, err
	}
	// Backfill the guard pattern lists for installs upgraded from before they
	// existed: AutoMigrate added guard_patterns / guard_patterns_local with an
	// empty DB default, so an existing row carries "" and the guard would
	// match nothing for that list. Seed the defaults once (persisted) so an
	// upgraded install gets a working guard. (A user who later clears either
	// list sees it restored next load — an accepted resolution of the
	// degenerate "guard on, no patterns" state.)
	needsSave := false
	if cur.GuardPatterns == "" {
		cur.GuardPatterns = domain.DefaultSettings().GuardPatterns
		needsSave = true
	}
	if cur.GuardPatternsLocal == "" {
		cur.GuardPatternsLocal = domain.DefaultSettings().GuardPatternsLocal
		needsSave = true
	}
	if needsSave {
		_ = s.repo.Save(cur) // best-effort: a save failure still returns usable defaults in-memory this session
	}
	cur.Sanitise()
	return cur, nil
}

// Update sanitises and stores the settings, and applies the start-at-login side
// effect when that flag changed. A login-agent failure is surfaced (the user
// asked for it) but the settings row is still saved first.
func (s *SettingsService) Update(in domain.Settings) (*domain.Settings, error) {
	prev, err := s.repo.Get()
	if err != nil {
		return nil, err
	}
	in.Sanitise()
	if err := s.repo.Save(&in); err != nil {
		return nil, err
	}
	if s.login != nil && in.StartAtLogin != prev.StartAtLogin {
		if err := s.login.Set(in.StartAtLogin); err != nil {
			return &in, err
		}
	}
	return &in, nil
}
