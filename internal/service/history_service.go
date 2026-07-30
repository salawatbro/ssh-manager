package service

import (
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// recentSessionLimit caps how many rows the detail page's "Recent sessions"
// card asks for. The card shows a short list, and a server with thousands of
// connects should not marshal them all across the binding.
const recentSessionLimit = 8

// HistoryService is the read side of the session log — the detail page's
// "Recent sessions" card. The write side lives in SSHService, which records a
// session's start and end; both share one store.SessionLogRepo.
type HistoryService struct {
	repo *store.SessionLogRepo
}

// NewHistoryService wires the read-only history service to the shared repo.
func NewHistoryService(repo *store.SessionLogRepo) *HistoryService {
	return &HistoryService{repo: repo}
}

// Recent returns a server's most recent sessions, newest first.
func (h *HistoryService) Recent(serverID string) ([]domain.SessionLog, error) {
	return h.repo.Recent(serverID, recentSessionLimit)
}
