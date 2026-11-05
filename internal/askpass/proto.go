package askpass

import (
	"regexp"
	"time"
)

// ProtoVersion is the control-socket protocol version.
const ProtoVersion = 1

// MaxRequestBytes caps one request line on the control socket.
const MaxRequestBytes = 16 << 10

const maxReplyBytes = 64 << 10

// Control-socket deadlines: reading the request, and the whole exchange (a
// Keychain read can take up to 8 s).
const (
	requestTimeout = 5 * time.Second
	totalTimeout   = 20 * time.Second
)

// Ops and reply actions on the control socket.
const (
	OpRedeem = "redeem"
	OpAsk    = "ask"

	ActionAnswer = "answer"
	ActionTTY    = "tty"
)

// Redeem failure codes.
const (
	CodeExpired    = "expired"
	CodeBadRequest = "bad_request"
)

// Request is one line a helper sends to the app.
type Request struct {
	V      int    `json:"v"`
	Op     string `json:"op"`
	Token  string `json:"token"`
	Prompt string `json:"prompt,omitempty"`
	Hint   string `json:"hint,omitempty"`
}

// RedeemReply answers OpRedeem.
type RedeemReply struct {
	OK      bool              `json:"ok"`
	Argv    []string          `json:"argv,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Title   string            `json:"title,omitempty"`
	Code    string            `json:"code,omitempty"`
	Message string            `json:"message,omitempty"`
}

// Reply answers OpAsk: either the secret, or "type it in the terminal".
type Reply struct {
	Action string `json:"action"`
	Value  string `json:"value,omitempty"`
	Echo   bool   `json:"echo,omitempty"`
	Notice string `json:"notice,omitempty"`
}

var tokenRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// ValidToken reports whether s has the shape of a launch or askpass token.
func ValidToken(s string) bool { return tokenRe.MatchString(s) }

// Environment variables the connect helper hands to ssh.
//
//nolint:gosec // G101: variable names, not credentials
const (
	EnvAskpass        = "SSH_ASKPASS"
	EnvAskpassRequire = "SSH_ASKPASS_REQUIRE"
	EnvAskpassPrompt  = "SSH_ASKPASS_PROMPT"
	EnvToken          = "ZISH_ASKPASS_TOKEN"
	EnvControlSocket  = "ZISH_CONTROL_SOCKET"
)
