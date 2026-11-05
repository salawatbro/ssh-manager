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

	// GrantDefault is the approval length the approval window picks first.
	GrantDefault string `gorm:"not null;default:'15m'" json:"grantDefault"`
	// GrantNeverProd keeps production servers out of approvals: each signature
	// for one asks again.
	GrantNeverProd bool `gorm:"not null;default:true" json:"grantNeverProd"`

	// RotateReminderDays is the key age the Security check flags; 0 = never.
	RotateReminderDays int `gorm:"not null;default:365" json:"rotateReminderDays"`
	// SecurityIgnored lists the Security check ids the user chose to ignore,
	// comma-separated.
	SecurityIgnored string `gorm:"not null;default:''" json:"securityIgnored"`

	// LauncherHotkey opens the launcher from any app, in canonical shortcut
	// form ("alt+space"); "" turns it off.
	LauncherHotkey string `gorm:"not null;default:'alt+space'" json:"launcherHotkey"`

	// LockOnSleep engages the App Lock when the Mac sleeps, its display
	// sleeps or the screen locks. Only with Require unlock on and a PIN set.
	LockOnSleep bool `gorm:"not null;default:true" json:"lockOnSleep"`

	// Appearance. Theme drives the pages' palette and NSApp's appearance.
	Theme     string `gorm:"not null;default:'night'" json:"theme"`
	Density   string `gorm:"not null;default:'comfortable'" json:"density"`
	IconStyle string `gorm:"not null;default:'icon'" json:"iconStyle"`
	ColorBy   string `gorm:"not null;default:'group'" json:"colorBy"`
	// MenuIcons shows icon tiles in the launcher.
	MenuIcons bool `gorm:"not null;default:true" json:"menuIcons"`

	// Tunnels. TunnelsReconnect is the master switch over every tunnel's
	// own Reconnect; TunnelsKeepWhileLocked off stops every tunnel on lock.
	TunnelsAutoStart       bool `gorm:"not null;default:true" json:"tunnelsAutoStart"`
	TunnelsReconnect       bool `gorm:"not null;default:true" json:"tunnelsReconnect"`
	TunnelsKeepWhileLocked bool `gorm:"not null;default:true" json:"tunnelsKeepWhileLocked"`
	TunnelsNotify          bool `gorm:"not null;default:true" json:"tunnelsNotify"`
	TunnelsSuggestPort     bool `gorm:"not null;default:true" json:"tunnelsSuggestPort"`

	// OpenAgain is what opening an already-open server should do.
	OpenAgain string `gorm:"not null;default:'ask'" json:"openAgain"`
}

// Theme values accepted in Settings.Theme.
const (
	ThemeNight = "night"
	ThemeDay   = "day"
	ThemeAuto  = "auto"
)

// ThemeIDs lists every accepted Settings.Theme value.
var ThemeIDs = []string{ThemeNight, ThemeDay, ThemeAuto}

// Density values accepted in Settings.Density.
const (
	DensityComfortable = "comfortable"
	DensityCompact     = "compact"
)

// DensityIDs lists every accepted Settings.Density value.
var DensityIDs = []string{DensityComfortable, DensityCompact}

// What a new server's tile shows (Settings.IconStyle).
const (
	IconStyleLetters = "letters"
	IconStyleIcon    = "icon"
)

// IconStyleIDs lists every accepted Settings.IconStyle value.
var IconStyleIDs = []string{IconStyleLetters, IconStyleIcon}

// How a new server's tile is tinted (Settings.ColorBy).
const (
	ColorByGroup = "group"
	ColorByNone  = "none"
)

// ColorByIDs lists every accepted Settings.ColorBy value.
var ColorByIDs = []string{ColorByGroup, ColorByNone}

// What opening an already-open server does (Settings.OpenAgain).
const (
	OpenAgainAsk   = "ask"
	OpenAgainFocus = "focus"
	OpenAgainNew   = "new"
)

// OpenAgainIDs lists every accepted Settings.OpenAgain value.
var OpenAgainIDs = []string{OpenAgainAsk, OpenAgainFocus, OpenAgainNew}

// NewServerIcon is the icon a new server gets with IconStyle "icon".
const NewServerIcon = "server"

// NewServerLook is the icon and colour a server created outside the server
// sheet (import, quick connect) starts with. "" keeps letters / the group's
// colour; the frontend's lib/look.ts newServerLook mirrors it.
func (s Settings) NewServerLook() (icon, color string) {
	if s.IconStyle == IconStyleIcon {
		icon = NewServerIcon
	}
	if s.ColorBy == ColorByNone {
		color = "gray"
	}
	return icon, color
}

// RotateReminderChoices are the accepted Settings.RotateReminderDays values.
var RotateReminderChoices = []int{0, 180, 365, 730}

// Approval lengths accepted in Settings.GrantDefault; agent.GrantLength uses
// the same strings.
const (
	GrantOnce      = "once"
	GrantFor15Min  = "15m"
	GrantUntilLock = "lock"
)

// GrantLengthIDs lists every accepted Settings.GrantDefault value.
var GrantLengthIDs = []string{GrantOnce, GrantFor15Min, GrantUntilLock}

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
		GrantDefault:       GrantFor15Min,
		GrantNeverProd:     true,
		RotateReminderDays: 365,
		LauncherHotkey:     DefaultLauncherShortcut,
		LockOnSleep:        true,
		Theme:              ThemeNight,
		Density:            DensityComfortable,
		IconStyle:          IconStyleIcon,
		ColorBy:            ColorByGroup,
		MenuIcons:          true,
		TunnelsAutoStart:   true,
		TunnelsReconnect:   true,
		// Running tunnels have always outlived the lock.
		TunnelsKeepWhileLocked: true,
		TunnelsNotify:          true,
		TunnelsSuggestPort:     true,
		OpenAgain:              OpenAgainAsk,
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
	if !slices.Contains(GrantLengthIDs, s.GrantDefault) {
		s.GrantDefault = GrantFor15Min
	}
	if !slices.Contains(RotateReminderChoices, s.RotateReminderDays) {
		s.RotateReminderDays = 365
	}
	s.Theme = oneOf(s.Theme, ThemeIDs, ThemeNight)
	s.Density = oneOf(s.Density, DensityIDs, DensityComfortable)
	s.IconStyle = oneOf(s.IconStyle, IconStyleIDs, IconStyleIcon)
	s.ColorBy = oneOf(s.ColorBy, ColorByIDs, ColorByGroup)
	s.OpenAgain = oneOf(s.OpenAgain, OpenAgainIDs, OpenAgainAsk)
	if sc, err := ParseLauncherShortcut(s.LauncherHotkey); err == nil {
		s.LauncherHotkey = sc
	} else {
		s.LauncherHotkey = DefaultLauncherShortcut
	}
	s.SecurityIgnored = JoinCheckIDs(SplitCheckIDs(s.SecurityIgnored))
	s.TerminalCustomCommand = sanitiseCustomCommand(s.TerminalCustomCommand)
	s.ID = 1
}

func oneOf(v string, allowed []string, fallback string) string {
	if slices.Contains(allowed, v) {
		return v
	}
	return fallback
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
