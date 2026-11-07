package domain

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// MaxServerCommands caps the saved commands of one server.
const MaxServerCommands = 20

// ServerCommand is a saved command for one server: running it opens the
// server in the terminal with Command in place of RunAfterConnect. The table
// is server_commands; the legacy snippets table belongs to a removed feature.
type ServerCommand struct {
	ID       string  `gorm:"primaryKey;type:text" json:"id"`
	ServerID string  `gorm:"not null;index" json:"serverId"`
	Server   *Server `gorm:"foreignKey:ServerID;constraint:OnDelete:CASCADE" json:"-"`
	Name     string  `gorm:"not null" json:"name"`
	Command  string  `gorm:"not null" json:"command"`
	// InMenuBar lists the command in the menu-bar panel.
	InMenuBar bool       `gorm:"not null;default:false" json:"inMenuBar"`
	Position  int        `gorm:"not null;default:0" json:"position"`
	LastRunAt *time.Time `json:"lastRunAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// Validate trims the name and command in place and checks them. Whether the
// server exists is the service's job.
func (c *ServerCommand) Validate() error {
	c.Name = strings.TrimSpace(c.Name)
	c.Command = strings.TrimSpace(c.Command)
	if n := utf8.RuneCountInString(c.Name); n < 1 || n > 64 {
		return validationError("Name the command (1 to 64 characters).")
	}
	if c.Command == "" {
		return validationError("Type the command to run.")
	}
	if !utf8.ValidString(c.Command) {
		return validationError("The command is not valid text.")
	}
	if utf8.RuneCountInString(c.Command) > MaxRunAfterConnectRunes {
		return validationError("The command must be at most 512 characters.")
	}
	for _, r := range c.Command {
		if unicode.IsControl(r) {
			return validationError("The command must be one line, with no tabs or control characters.")
		}
	}
	return nil
}
