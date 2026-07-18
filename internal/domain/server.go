// Package domain holds the core types and rules. It depends on nothing
// outside the standard library (NFR-05).
package domain

import "time"

// AuthType is how a connection authenticates.
type AuthType string

// The supported authentication methods. v0.1 only ever writes AuthAgent —
// it is the one method that needs no secret, and secrets wait for the
// keychain (SEC-01).
const (
	AuthPassword AuthType = "password"
	AuthKey      AuthType = "key"
	AuthAgent    AuthType = "agent"
)

// Environment tags a server with the blast radius of getting it wrong. It
// drives the UI-11 marker and, from v1, the production guard (FR-14).
type Environment string

// The environments a server can be tagged with. EnvNone is the default:
// untagged, not "safe".
const (
	EnvProd    Environment = "prod"
	EnvStaging Environment = "staging"
	EnvDev     Environment = "dev"
	EnvNone    Environment = "none"
)

// Server is a connection profile.
//
// It carries no password or passphrase field, and must never grow one:
// secrets live in the OS keychain only (SEC-01).
type Server struct {
	ID   string `gorm:"primaryKey;type:text" json:"id"`
	Name string `gorm:"not null;index"        json:"name"`
	Host string `gorm:"not null"              json:"host"`
	Port int    `gorm:"not null;default:22"   json:"port"`
	User string `gorm:"not null"              json:"user"`

	AuthType AuthType `gorm:"not null;default:'password'" json:"authType"`
	KeyPath  string   `json:"keyPath"`

	JumpID *string `gorm:"index" json:"jumpId"`
	Jump   *Server `gorm:"foreignKey:JumpID"  json:"-"`

	GroupName   string      `gorm:"column:group_name;index" json:"group"`
	Environment Environment `gorm:"not null;default:'none'" json:"environment"`
	Tags        string      `json:"tags"`
	Notes       string      `json:"notes"`

	// TwoFactor marks a server as requiring a TOTP code at connect time.
	// The code and its secret NEVER live here or anywhere in the DB/JSON
	// export — only this flag does. The secret itself lives in the OS
	// keychain (SEC-01), keyed by this server's ID (secret.Store).
	TwoFactor bool `gorm:"not null;default:false" json:"twoFactor"`

	LastUsedAt *time.Time `gorm:"index" json:"lastUsedAt"`
	UseCount   int        `gorm:"not null;default:0" json:"useCount"`
	SortOrder  int        `gorm:"not null;default:0" json:"sortOrder"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
