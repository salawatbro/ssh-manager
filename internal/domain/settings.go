package domain

// Settings is the single-row app configuration table (FR-12.1: settings live
// in the database, never localStorage). ID is always 1. Defaults come from
// DefaultSettings() and the gorm column defaults, applied on first run.
type Settings struct {
	ID uint `gorm:"primaryKey" json:"-"`

	// General
	StartAtLogin       bool `json:"startAtLogin"`
	KeepRunningInTray  bool `gorm:"not null;default:true" json:"keepRunningInTray"`
	ConfirmOnQuit      bool `gorm:"not null;default:true" json:"confirmOnQuit"`
	ConnectTimeoutSecs int  `gorm:"not null;default:10" json:"connectTimeoutSecs"`

	// Terminal (read live by the frontend; v0.3 hard-coded these)
	TermFont       string `gorm:"not null;default:'JetBrains Mono'" json:"termFont"`
	TermFontSize   int    `gorm:"not null;default:13" json:"termFontSize"`
	TermTheme      string `gorm:"not null;default:'graphite'" json:"termTheme"`
	TermCursor     string `gorm:"not null;default:'block'" json:"termCursor"` // block|bar|underline
	TermBlink      bool   `gorm:"not null;default:true" json:"termBlink"`
	TermScrollback int    `gorm:"not null;default:10000" json:"termScrollback"`

	// Prod guard (FR-14): an ERGONOMIC barrier on dangerous commands typed
	// against a prod-tagged server, not a security control (FR-14.9). The DB
	// default for GuardPatterns is deliberately empty (multi-line text doesn't
	// fit a single-line gorm default); the real default list lives in
	// DefaultSettings() below and is what every first-run row actually gets.
	GuardEnabled  bool   `gorm:"not null;default:true" json:"guardEnabled"`
	GuardPatterns string `gorm:"not null;default:''" json:"guardPatterns"`
}

// DefaultSettings returns the first-run defaults. Kept in code (not only in
// gorm tags) so the service can hand a complete object back before any row
// exists, and so validation has a fallback for an out-of-range stored value.
func DefaultSettings() Settings {
	return Settings{
		ID:                 1,
		KeepRunningInTray:  true,
		ConfirmOnQuit:      true,
		ConnectTimeoutSecs: 10,
		TermFont:           "JetBrains Mono",
		TermFontSize:       13,
		TermTheme:          "graphite",
		TermCursor:         "block",
		TermBlink:          true,
		TermScrollback:     10000,
		GuardEnabled:       true,
		GuardPatterns:      defaultGuardPatterns,
	}
}

// defaultGuardPatterns is the newline-separated first-run value of
// Settings.GuardPatterns (see SplitPatterns in guard.go).
const defaultGuardPatterns = "rm -rf\n" +
	"mkfs\n" +
	"dd if=\n" +
	"dd of=\n" +
	"> /dev/sd\n" +
	"chmod -R 777\n" +
	"shutdown\n" +
	"reboot\n" +
	":(){ :|:& };:"

// Sanitise clamps stored/incoming values to safe ranges so a corrupt row or a
// hand-edited import can't drive the terminal or dialer into nonsense. It never
// errors — it repairs. Called by the service on Get and Update.
func (s *Settings) Sanitise() {
	if s.ConnectTimeoutSecs < 1 || s.ConnectTimeoutSecs > 120 {
		s.ConnectTimeoutSecs = 10
	}
	if s.TermFontSize < 8 || s.TermFontSize > 32 {
		s.TermFontSize = 13
	}
	if s.TermScrollback < 100 || s.TermScrollback > 100000 {
		s.TermScrollback = 10000
	}
	switch s.TermCursor {
	case "block", "bar", "underline":
	default:
		s.TermCursor = "block"
	}
	if s.TermTheme != "graphite" {
		s.TermTheme = "graphite" // only theme in v0.5
	}
	if s.TermFont == "" {
		s.TermFont = "JetBrains Mono"
	}
	s.ID = 1
}
