package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

// AgentKey is a private key held by Zish's built-in ssh-agent. The key itself
// lives only in the Keychain (PKCS#8 DER); this row is its public metadata.
type AgentKey struct {
	ID             string     `gorm:"primaryKey;type:text" json:"id"`
	Name           string     `gorm:"not null" json:"name"`
	Type           string     `gorm:"not null" json:"type"` // ssh-ed25519 | ecdsa-sha2-nistp256|384|521 | ssh-rsa
	Bits           int        `gorm:"not null;default:0" json:"bits"`
	Fingerprint    string     `gorm:"not null;uniqueIndex" json:"fingerprint"` // SHA256:…
	PublicKey      string     `gorm:"not null" json:"publicKey"`               // authorized_keys line, no comment
	Comment        string     `gorm:"not null;default:''" json:"comment"`
	RequireConfirm bool       `gorm:"not null;default:true" json:"requireConfirm"`
	CreatedAt      time.Time  `json:"createdAt"`
	LastUsedAt     *time.Time `json:"lastUsedAt"`
}

// Sign-log outcomes.
const (
	SignAllowed   = "allowed"
	SignConfirmed = "confirmed"
	// SignGranted: an open approval for the app and key covered it.
	SignGranted = "granted"
	SignDenied  = "denied"
	SignLocked  = "locked"
	SignError   = "error"
)

// AgentSignEvent records one agent signing decision. It never holds the
// signed data.
type AgentSignEvent struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	KeyID       string    `gorm:"index" json:"keyId"` // "" for temporary keys
	KeyName     string    `json:"keyName"`            // denormalised: survives key delete
	Fingerprint string    `json:"fingerprint"`
	ClientName  string    `json:"clientName"`
	ClientApp   string    `json:"clientApp"`
	ClientChain string    `json:"clientChain"` // "ssh ← git ← zsh"
	ClientPID   int       `json:"clientPid"`
	InProcess   bool      `json:"inProcess"`
	Destination string    `json:"destination"`
	Forwarded   bool      `json:"forwarded"`
	Outcome     string    `json:"outcome"`
	Detail      string    `json:"detail"`
	CreatedAt   time.Time `gorm:"index" json:"createdAt"`
}

// MaxKeyCommentBytes caps an agent key comment. The comment ends up in an
// authorized_keys line, so it must never carry a newline either.
const MaxKeyCommentBytes = 256

// Validate trims and checks the user-editable fields.
func (k *AgentKey) Validate() error {
	k.Name = strings.TrimSpace(k.Name)
	k.Comment = strings.TrimSpace(k.Comment)
	if err := ValidateKeyName(k.Name); err != nil {
		return err
	}
	return ValidateKeyComment(k.Comment)
}

// ValidateKeyName checks an agent key name: 1–64 runes, no control characters.
func ValidateKeyName(name string) error {
	if n := utf8.RuneCountInString(name); n < 1 || n > 64 {
		return validationError("Key name must be 1 to 64 characters.")
	}
	if hasControl(name) {
		return validationError("Key name must not contain control characters.")
	}
	return nil
}

// ValidateKeyComment checks an agent key comment: at most 256 bytes, no
// control characters (a newline would inject an authorized_keys line).
func ValidateKeyComment(comment string) error {
	if len(comment) > MaxKeyCommentBytes {
		return validationError("Key comment must be at most 256 bytes.")
	}
	if hasControl(comment) {
		return validationError("Key comment must not contain control characters.")
	}
	return nil
}

func hasControl(s string) bool {
	if !utf8.ValidString(s) {
		return true
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r <= 0x9f) {
			return true
		}
	}
	return false
}
