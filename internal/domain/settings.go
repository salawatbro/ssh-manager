package domain

import (
	"slices"
	"strings"
	"unicode/utf8"
)

// Settings is the single-row app configuration table (FR-12.1: settings live
// in the database, never localStorage). ID is always 1. Defaults come from
// DefaultSettings() and the gorm column defaults, applied on first run.
//
// Databases from older versions still carry columns for settings that no
// longer exist (terminal, guard, session restore). They are left in place on
// purpose: every one has a column default, so inserts and saves that omit
// them keep working, and dropping them would be a destructive migration.
type Settings struct {
	ID uint `gorm:"primaryKey" json:"-"`

	// General
	StartAtLogin      bool `json:"startAtLogin"`
	KeepRunningInTray bool `gorm:"not null;default:true" json:"keepRunningInTray"`
	// ConfirmOnQuit asks before quitting while port-forwarding tunnels are
	// running, since quitting stops them.
	ConfirmOnQuit      bool `gorm:"not null;default:true" json:"confirmOnQuit"`
	ConnectTimeoutSecs int  `gorm:"not null;default:10" json:"connectTimeoutSecs"`

	// TourSeen is set true once the first-run welcome tour has been shown (or
	// skipped); false on a fresh install so the tour auto-opens exactly once.
	// Not a secret — a plain onboarding flag.
	TourSeen bool `gorm:"not null;default:false" json:"tourSeen"`

	// App lock (see docs/superpowers/specs/2026-07-30-app-lock-design.md). The
	// PIN itself is NOT here — it is a bcrypt hash in the Keychain. These are
	// the non-secret preferences. LockEnabled ("Require unlock") is independent
	// of whether a PIN is set, so a user can keep a PIN but switch locking off.
	LockEnabled       bool `gorm:"not null;default:false" json:"lockEnabled"`
	LockUseBiometrics bool `gorm:"not null;default:true" json:"lockUseBiometrics"`
	LockIdleEnabled   bool `gorm:"not null;default:true" json:"lockIdleEnabled"`
	LockIdleMinutes   int  `gorm:"not null;default:10" json:"lockIdleMinutes"`

	// Connect: how the external terminal is opened.
	Terminal              string `gorm:"not null;default:'terminal'" json:"terminal"`
	TerminalCustomCommand string `gorm:"not null;default:''" json:"terminalCustomCommand"`
	TerminalOpenInTab     bool   `gorm:"not null;default:false" json:"terminalOpenInTab"`
	AutoFillSecrets       bool   `gorm:"not null;default:true" json:"autoFillSecrets"`
	// KeepAlive reuses the keep_awake column of the removed embedded terminal,
	// so an existing user's choice carries over to the ssh launch.
	KeepAlive bool `gorm:"column:keep_awake;not null;default:true" json:"keepAlive"`

	// AgentEnabled serves Zish's ssh-agent socket to other programs. In-process
	// signing (tunnels, Test connection) works either way.
	AgentEnabled bool `gorm:"not null;default:true" json:"agentEnabled"`
}

// Terminal app ids accepted in Settings.Terminal. The launcher's catalog uses
// the same strings.
const (
	TerminalApple     = "terminal"
	TerminalITerm2    = "iterm2"
	TerminalGhostty   = "ghostty"
	TerminalWezTerm   = "wezterm"
	TerminalKitty     = "kitty"
	TerminalAlacritty = "alacritty"
	TerminalCustom    = "custom"
)

// TerminalIDs lists every accepted Settings.Terminal value.
var TerminalIDs = []string{
	TerminalApple, TerminalITerm2, TerminalGhostty, TerminalWezTerm,
	TerminalKitty, TerminalAlacritty, TerminalCustom,
}

// MaxCustomCommandBytes caps Settings.TerminalCustomCommand.
const MaxCustomCommandBytes = 1024

// DefaultSettings returns the first-run defaults. Kept in code (not only in
// gorm tags) so the service can hand a complete object back before any row
// exists, and so validation has a fallback for an out-of-range stored value.
func DefaultSettings() Settings {
	return Settings{
		ID:                 1,
		KeepRunningInTray:  true,
		ConfirmOnQuit:      true,
		ConnectTimeoutSecs: 10,
		LockUseBiometrics:  true,
		LockIdleEnabled:    true,
		LockIdleMinutes:    10,
		Terminal:           TerminalApple,
		AutoFillSecrets:    true,
		KeepAlive:          true,
		AgentEnabled:       true,
	}
}

// Sanitise clamps stored/incoming values to safe ranges so a corrupt row or a
// hand-edited import can't drive the dialer or the lock into nonsense. It never
// errors — it repairs. Called by the service on Get and Update.
func (s *Settings) Sanitise() {
	if s.ConnectTimeoutSecs < 1 || s.ConnectTimeoutSecs > 120 {
		s.ConnectTimeoutSecs = 10
	}
	if s.LockIdleMinutes < 1 || s.LockIdleMinutes > 120 {
		s.LockIdleMinutes = 10
	}
	if !slices.Contains(TerminalIDs, s.Terminal) {
		s.Terminal = TerminalApple
	}
	s.TerminalCustomCommand = sanitiseCustomCommand(s.TerminalCustomCommand)
	s.ID = 1
}

func sanitiseCustomCommand(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if !utf8.ValidString(cmd) {
		return ""
	}
	for _, r := range cmd {
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r <= 0x9f) {
			return ""
		}
	}
	if len(cmd) > MaxCustomCommandBytes {
		cut := MaxCustomCommandBytes
		for cut > 0 && !utf8.RuneStart(cmd[cut]) {
			cut--
		}
		cmd = strings.TrimSpace(cmd[:cut])
	}
	return cmd
}
