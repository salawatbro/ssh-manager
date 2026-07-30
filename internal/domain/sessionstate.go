package domain

// SessionState persists UI session state across launches — currently just the
// list of open terminal tabs, for the "Restore sessions on launch" setting. Like
// Settings it is a single row (ID always 1). It holds server ids only, no
// secret and no shell content.
type SessionState struct {
	ID uint `gorm:"primaryKey" json:"-"`
	// OpenTabs is a JSON array of the server ids that had an open terminal tab,
	// in tab order. Stored as text because the set changes as tabs open and
	// close; the store marshals/unmarshals it.
	OpenTabs string `gorm:"not null;default:'[]'" json:"openTabs"`
}
