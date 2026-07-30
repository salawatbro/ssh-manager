package service

import "github.com/salawat/sshmgr/internal/store"

// SessionStateService is the frontend's door to the persisted open-tab list
// behind "Restore sessions on launch". The frontend saves the list as tabs open
// and close, and loads it once at launch.
type SessionStateService struct {
	repo *store.SessionStateRepo
}

// NewSessionStateService wires the service to the session-state repo.
func NewSessionStateService(repo *store.SessionStateRepo) *SessionStateService {
	return &SessionStateService{repo: repo}
}

// SaveOpenTabs records the server ids of the currently open terminal tabs.
func (s *SessionStateService) SaveOpenTabs(serverIDs []string) error {
	return s.repo.SaveOpenTabs(serverIDs)
}

// LoadOpenTabs returns the server ids to reopen at launch.
func (s *SessionStateService) LoadOpenTabs() ([]string, error) {
	return s.repo.LoadOpenTabs()
}
