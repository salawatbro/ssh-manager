package store

import (
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

func newSessionLogRepo(t *testing.T) *SessionLogRepo {
	t.Helper()
	db, err := Open(t.TempDir() + "/db.sqlite")
	if err != nil {
		t.Fatalf("Open error = %v", err)
	}
	return NewSessionLogRepo(db)
}

func TestSessionLogStartEndRecent(t *testing.T) {
	r := newSessionLogRepo(t)
	base := time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC)

	// Two ended sessions and one still open, in start order.
	id1, err := r.Start("srv", base)
	if err != nil {
		t.Fatalf("Start error = %v", err)
	}
	if err := r.End(id1, base.Add(time.Hour), domain.OutcomeClosed); err != nil {
		t.Fatalf("End error = %v", err)
	}
	id2, _ := r.Start("srv", base.Add(2*time.Hour))
	_ = r.End(id2, base.Add(2*time.Hour+10*time.Minute), domain.OutcomeDropped)
	openID, _ := r.Start("srv", base.Add(3*time.Hour))
	// A different server's session must not leak into srv's history.
	_, _ = r.Start("other", base.Add(4*time.Hour))

	logs, err := r.Recent("srv", 10)
	if err != nil {
		t.Fatalf("Recent error = %v", err)
	}
	if len(logs) != 3 {
		t.Fatalf("Recent len = %d, want 3", len(logs))
	}
	// Newest first.
	if logs[0].ID != openID {
		t.Fatalf("Recent[0].ID = %d, want the open session %d", logs[0].ID, openID)
	}
	if logs[0].EndedAt != nil || logs[0].Outcome != "" {
		t.Fatalf("open session should have no end: %+v", logs[0])
	}
	if logs[2].EndedAt == nil || logs[2].Outcome != domain.OutcomeClosed {
		t.Fatalf("oldest should be a closed, ended session: %+v", logs[2])
	}
}

func TestSessionLogRecentRespectsLimit(t *testing.T) {
	r := newSessionLogRepo(t)
	base := time.Date(2026, 7, 30, 9, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		_, _ = r.Start("srv", base.Add(time.Duration(i)*time.Minute))
	}
	logs, _ := r.Recent("srv", 3)
	if len(logs) != 3 {
		t.Fatalf("Recent(limit 3) len = %d, want 3", len(logs))
	}
}

// End(0) is the "Start failed" path — it must not touch any row.
func TestSessionLogEndIgnoresZeroID(t *testing.T) {
	r := newSessionLogRepo(t)
	if err := r.End(0, time.Now(), domain.OutcomeClosed); err != nil {
		t.Fatalf("End(0) error = %v", err)
	}
}
