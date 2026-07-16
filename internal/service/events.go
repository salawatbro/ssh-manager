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
