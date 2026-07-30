package domain

import "time"

// Session outcomes recorded on a SessionLog when a session ends. A live session
// has neither (EndedAt nil, Outcome ""). Failed connects are not logged — only
// sessions that actually opened, so there is no "refused" outcome here.
const (
	OutcomeClosed  = "closed"  // user closed the tab, or the shell exited cleanly
	OutcomeDropped = "dropped" // the connection was lost (dead peer / abnormal close)
)

// SessionLog is one terminal session against a server, for the detail page's
// "Recent sessions" card. It carries no secret and no shell output — just when
// the session ran and how it ended. Written by SSHService on open/close, read
// by HistoryService.
//
// The id is an autoincrement so a log is cheap to append; the app-level id used
// elsewhere (uuid strings) would buy nothing for a row nobody references by id.
type SessionLog struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	ServerID  string     `gorm:"index;not null" json:"serverId"`
	StartedAt time.Time  `gorm:"not null" json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"` // nil while the session is still open
	Outcome   string     `json:"outcome"` // "" while open, else OutcomeClosed / OutcomeDropped
}
