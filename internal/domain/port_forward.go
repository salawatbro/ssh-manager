package domain

import "time"

// ForwardType is the tunnel direction. L = local (-L), R = remote (-R).
type ForwardType string

// The tunnel directions. ForwardLocal is an -L forward (local port to a remote
// destination); ForwardRemote is an -R forward (remote port to a local one).
const (
	ForwardLocal  ForwardType = "L"
	ForwardRemote ForwardType = "R"
)

// PortForward is a saved tunnel definition attached to a server. It carries no
// secret (SEC-01) — it only names ports and hosts.
type PortForward struct {
	ID        string      `gorm:"primaryKey;type:text" json:"id"`
	ServerID  string      `gorm:"not null;index" json:"serverId"`
	Server    *Server     `gorm:"foreignKey:ServerID;constraint:OnDelete:CASCADE" json:"-"`
	Name      string      `gorm:"not null" json:"name"`
	Type      ForwardType `gorm:"not null" json:"type"`
	BindAddr  string      `gorm:"not null;default:'127.0.0.1'" json:"bindAddr"`
	BindPort  int         `gorm:"not null" json:"bindPort"`
	DestHost  string      `gorm:"not null" json:"destHost"`
	DestPort  int         `gorm:"not null" json:"destPort"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
}

func validPort(p int) bool { return p >= 1 && p <= 65535 }

// Validate rejects a malformed forward. No argv reaches ssh here (x/crypto
// dials by host:port), but ports and hosts are still bounded so a bad row
// cannot start a nonsense listener.
func (f *PortForward) Validate() error {
	if f.Name == "" {
		return validationError("The forward needs a name.")
	}
	if f.Type != ForwardLocal && f.Type != ForwardRemote {
		return validationError("Forward type must be local (L) or remote (R).")
	}
	if f.BindAddr == "" {
		return validationError("The bind address is required.")
	}
	if !validPort(f.BindPort) {
		return validationError("The bind port must be between 1 and 65535.")
	}
	if f.DestHost == "" {
		return validationError("The destination host is required.")
	}
	if !validPort(f.DestPort) {
		return validationError("The destination port must be between 1 and 65535.")
	}
	return nil
}
