package service

// SSHService is bound to the frontend. It delivers the user's answers to the
// prompts an in-process dial raises mid-handshake (Test Connection, a tunnel
// start): a host-key confirmation and a typed 2FA code.
type SSHService struct {
	prompter     *HostKeyPrompter
	codePrompter *CodePrompter
}

// NewSSHService wires the service to the shared host-key and 2FA code
// prompters the dialer blocks on.
func NewSSHService(p *HostKeyPrompter, codePrompter *CodePrompter) *SSHService {
	return &SSHService{prompter: p, codePrompter: codePrompter}
}

// ConfirmHostKey delivers the user's decision for a pending host-key prompt.
// The blocking dial is waiting on this.
func (s *SSHService) ConfirmHostKey(requestID string, accept bool) error {
	return s.prompter.Resolve(requestID, accept)
}

// SubmitCode delivers the user's typed 2FA code for a pending code:request
// (TOTP or an unrecognised keyboard-interactive question). The blocking dial —
// inside the keyboard-interactive challenge — is waiting on this.
func (s *SSHService) SubmitCode(requestID, code string) error {
	return s.codePrompter.Resolve(requestID, code)
}
