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
	repo    *store.SettingsRepo
	login   LoginAgent
	onSaved func(prev, next domain.Settings)
	stacks  *store.StackRepo
}

// SetSettingsStacks lets Update refuse a launcher shortcut a stack already
// uses. Package-level so it never becomes a frontend binding.
func SetSettingsStacks(s *SettingsService, stacks *store.StackRepo) { s.stacks = stacks }

// SetOnSettingsSaved registers fn to run after every successful Update, e.g.
// to start or stop the agent socket. Package-level so it never becomes a
// frontend binding.
func SetOnSettingsSaved(s *SettingsService, fn func(prev, next domain.Settings)) {
	s.onSaved = fn
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
	// Sanitise would quietly put ⌥Space back; a shortcut the user recorded
	// is refused with the reason instead.
	if in.LauncherHotkey, err = domain.ParseLauncherShortcut(in.LauncherHotkey); err != nil {
		return nil, err
	}
	if in.LauncherHotkey != prev.LauncherHotkey {
		if err := s.launcherHotkeyFree(in.LauncherHotkey); err != nil {
			return nil, err
		}
	}
	in.Sanitise()
	if err := s.repo.Save(&in); err != nil {
		return nil, err
	}
	if s.onSaved != nil {
		s.onSaved(*prev, in)
	}
	if s.login != nil && in.StartAtLogin != prev.StartAtLogin {
		if err := s.login.Set(in.StartAtLogin); err != nil {
			return &in, err
		}
	}
	return &in, nil
}

func (s *SettingsService) launcherHotkeyFree(sc string) error {
	if sc == "" || s.stacks == nil {
		return nil
	}
	all, err := s.stacks.List()
	if err != nil {
		return err
	}
	for _, st := range all {
		if st.Shortcut == sc {
			return domain.NewError(domain.CodeValidation,
				ShortcutLabel(sc)+" already launches "+st.Name+". Pick another shortcut.")
		}
	}
	return nil
}
