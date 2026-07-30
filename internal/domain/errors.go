package domain

// Error codes. These are stable identifiers the frontend switches on;
// Message is what the user reads (TZ 11.2). Do not renumber or rename —
// the TypeScript modals match on these exact strings.
const (
	CodeValidation = "ERR_VALIDATION"
	CodeNotFound   = "ERR_NOT_FOUND"

	// Connection (TZ 11.2)
	CodeConnRefused = "ERR_CONN_REFUSED"
	CodeConnTimeout = "ERR_CONN_TIMEOUT"
	CodeDNS         = "ERR_DNS"

	// Auth (TZ 11.2)
	CodeAuthFailed    = "ERR_AUTH_FAILED"
	CodeKeyNotFound   = "ERR_KEY_NOT_FOUND"
	CodeKeyPassphrase = "ERR_KEY_PASSPHRASE" //nolint:gosec // G101 pattern-matches "PASSPHRASE" in the name; this is an error code, not a secret.
	CodeAgentUnavail  = "ERR_AGENT_UNAVAILABLE"

	// Host key (TZ 11.2). CodeHostKeyRevoked is NOT in the TZ catalog —
	// x/crypto exposes a distinct *knownhosts.RevokedError for @revoked
	// lines, a harder stop than a changed key. Added here; Task 15 records
	// the TZ addition.
	CodeHostKeyChanged  = "ERR_HOSTKEY_CHANGED"
	CodeHostKeyRejected = "ERR_HOSTKEY_REJECTED"
	CodeHostKeyRevoked  = "ERR_HOSTKEY_REVOKED"

	// Session lifecycle. Emitted when an established terminal session drops
	// (dead peer / remote shell exit) — a soft, recoverable stop the frontend
	// turns into a Reconnect pane. Not in the original TZ 11.2; recorded for
	// the TZ update (see the v0.3 plan's Task 7).
	CodeSessionClosed = "ERR_SESSION_CLOSED"

	// Keychain (TZ 11.2)
	CodeKeychain = "ERR_KEYCHAIN"

	// Jump host (TZ 11.2) — sshx is built to support these from v0.2, the
	// UI selector arrives v0.6.
	CodeJumpFailed = "ERR_JUMP_FAILED"
	CodeJumpCycle  = "ERR_JUMP_CYCLE"

	// CodeInternal is an unexpected internal failure with no more specific code.
	CodeInternal = "ERR_INTERNAL"
)

// Error is a domain error carrying a stable code alongside the message.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Message }

// NewError builds a coded domain error.
func NewError(code, msg string) *Error { return &Error{Code: code, Message: msg} }

// ErrNotFound is returned when a lookup by ID finds nothing.
var ErrNotFound = &Error{Code: CodeNotFound, Message: "Server not found."}

func validationError(msg string) *Error {
	return &Error{Code: CodeValidation, Message: msg}
}
