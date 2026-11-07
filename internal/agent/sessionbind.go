package agent

import (
	"errors"

	"golang.org/x/crypto/ssh"
)

const extSessionBind = "session-bind@openssh.com"

// maxBinds caps session-bind records per connection, as OpenSSH's agent does.
const maxBinds = 16

type sessionBind struct {
	hostKey    ssh.PublicKey
	sessionID  []byte
	forwarding bool
}

// parseSessionBind decodes and verifies a session-bind extension: the host
// key's signature over the session id must check out.
func parseSessionBind(contents []byte) (sessionBind, error) {
	var msg struct {
		HostKey    []byte
		SessionID  []byte
		Signature  []byte
		Forwarding bool
	}
	if err := ssh.Unmarshal(contents, &msg); err != nil {
		return sessionBind{}, err
	}
	hostKey, err := ssh.ParsePublicKey(msg.HostKey)
	if err != nil {
		return sessionBind{}, err
	}
	var sig ssh.Signature
	if err := ssh.Unmarshal(msg.Signature, &sig); err != nil {
		return sessionBind{}, err
	}
	if err := hostKey.Verify(msg.SessionID, &sig); err != nil {
		return sessionBind{}, errors.New("agent: session-bind signature does not verify")
	}
	return sessionBind{hostKey: hostKey, sessionID: msg.SessionID, forwarding: msg.Forwarding}, nil
}
