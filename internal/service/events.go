package service

// HostKeyRequest is the hostkey:request event payload (TZ 8). It mirrors
// sshx.HostKeyRequest as a concrete named type so main.go's
// application.RegisterEvent[HostKeyRequest] gives the binding generator a
// type to turn into typed TypeScript. This file imports nothing from Wails,
// so internal/service stays cgo-free.
type HostKeyRequest struct {
	RequestID      string `json:"requestID"`
	Hostname       string `json:"hostname"`
	KeyType        string `json:"keyType"`
	Fingerprint    string `json:"fingerprint"`
	IsChanged      bool   `json:"isChanged"`
	IsRevoked      bool   `json:"isRevoked"`
	OldFingerprint string `json:"oldFingerprint"`
}

// CodeRequest is the code:request event payload (TZ 8 TOTP/2FA addendum).
// It mirrors sshx.CodeRequest as a concrete named type so main.go's
// application.RegisterEvent[CodeRequest] gives the binding generator a type
// to turn into typed TypeScript. This file imports nothing from Wails, so
// internal/service stays cgo-free.
type CodeRequest struct {
	RequestID  string `json:"requestID"`
	ServerName string `json:"serverName"`
	Prompt     string `json:"prompt"`
	Echo       bool   `json:"echo"` // whether the typed answer should be visible
}

// TrayConnect is the tray:connect event payload: the id of the pinned server
// whose menu-bar entry was clicked. main.go emits it (after showing the window)
// and the frontend opens or focuses that server. Named here — like
// HostKeyRequest/CodeRequest — so main.go's application.RegisterEvent[TrayConnect]
// gives the binding generator a type for typed TypeScript, while
// internal/service stays cgo-free.
type TrayConnect struct {
	ServerID string `json:"serverID"`
}

// ConnectStage is the connect:stage event payload — one per real phase of a
// terminal connect (resolve/tcp/hostkey/auth), for the "Connecting…" overlay.
// ConnectID correlates it with the pane that is connecting; the frontend times
// the gaps between stages. Carries no secret.
type ConnectStage struct {
	ConnectID string `json:"connectID"`
	Host      string `json:"host"`
	Stage     string `json:"stage"` // sshx.Stage* — "resolve" | "tcp" | "hostkey" | "auth"
}

// SftpProgress is the sftp:progress event payload: one update for an in-flight
// transfer (or its terminal Finished/Error state). Carries no secret (SEC-01).
type SftpProgress struct {
	TransferID  string `json:"transferID"`
	Direction   string `json:"direction"` // "upload" | "download"
	CurrentFile string `json:"currentFile"`
	Done        int64  `json:"done"`
	Total       int64  `json:"total"`
	Rate        int64  `json:"rate"` // bytes/sec, smoothed; 0 until the first sample window elapses
	Finished    bool   `json:"finished"`
	Error       string `json:"error"` // non-empty on failure
}
