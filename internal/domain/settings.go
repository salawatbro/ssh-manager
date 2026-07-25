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

	// ShellIntegration injects an OSC 133 snippet on connect (bash/zsh) to mark
	// prompt/command/output boundaries. Off = plain terminal.
	ShellIntegration bool `gorm:"not null;default:true" json:"shellIntegration"`

	// Prod guard (FR-14): an ERGONOMIC barrier on dangerous commands typed
	// against a prod-tagged server, not a security control (FR-14.9). The DB
	// default for GuardPatterns is deliberately empty (multi-line text doesn't
	// fit a single-line gorm default); the real default list lives in
	// DefaultSettings() below and is what every first-run row actually gets.
	GuardEnabled  bool   `gorm:"not null;default:true" json:"guardEnabled"`
	GuardPatterns string `gorm:"not null;default:''" json:"guardPatterns"`

	// GuardPatternsLocal is the guard list for the LOCAL terminal tab. It is
	// separate from (and shorter than) GuardPatterns on purpose: `rm -rf` as a
	// substring is an everyday command on a dev machine, and a barrier that
	// fires on every `rm -rf node_modules` gets switched off — which would also
	// disarm the production one. Same DB-default caveat as GuardPatterns: the
	// real first-run list lives in DefaultSettings().
	GuardPatternsLocal string `gorm:"not null;default:''" json:"guardPatternsLocal"`

	// TourSeen is set true once the first-run welcome tour has been shown (or
	// skipped); false on a fresh install so the tour auto-opens exactly once.
	// Not a secret — a plain onboarding flag.
	TourSeen bool `gorm:"not null;default:false" json:"tourSeen"`
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
		ShellIntegration:   true,
		GuardEnabled:       true,
		GuardPatterns:      defaultGuardPatterns,
		GuardPatternsLocal: defaultLocalGuardPatterns,
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

// defaultLocalGuardPatterns is the newline-separated first-run value of
// Settings.GuardPatternsLocal — only the commands that would wreck the
// machine. Relative-path deletes like `rm -rf node_modules` pass untouched,
// but the "rm -rf /" and "rm -rf ~" anchors are bare substrings: they also
// fire on any absolute- or ~-relative recursive delete (e.g. `rm -rf /tmp/x`
// or `rm -rf ~/Library/Caches/pip`), because substring matching has no notion
// of end-of-path and cannot tell the root from a path under it. That is
// accepted, not overlooked — a false positive on a deep clean costs less than
// missing a real `rm -rf /`. This app ships on macOS, so the disk-destroyer
// entries name Darwin tools (diskutil, newfs_, /dev/disk*, /dev/rdisk*); mkfs
// is kept too since internal/ cross-compiles for Linux, where it is the
// right name.
const defaultLocalGuardPatterns = "rm -rf /\n" +
	"rm -rf ~\n" +
	"mkfs\n" +
	"of=/dev/\n" +
	"> /dev/disk\n" +
	"> /dev/rdisk\n" +
	"diskutil erase\n" +
	"diskutil apfs delete\n" +
	"newfs_\n" +
	"--no-preserve-root\n" +
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
