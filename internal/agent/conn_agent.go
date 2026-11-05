package agent

import (
	"errors"
	"io"
	"sync"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"
)

// connAgent is the agent one socket connection talks to. It remembers the
// connection's session-bind records for display.
type connAgent struct {
	core   *Core
	client ClientInfo

	mu    sync.Mutex
	binds []sessionBind
}

var _ sshagent.ExtendedAgent = (*connAgent)(nil)

// Serve runs the agent protocol on conn until it closes.
func (c *Core) Serve(conn io.ReadWriter, client ClientInfo) error {
	return sshagent.ServeAgent(&connAgent{core: c, client: client}, conn)
}

func (a *connAgent) List() ([]*sshagent.Key, error) { return a.core.listKeys(), nil }

func (a *connAgent) Sign(key ssh.PublicKey, data []byte) (*ssh.Signature, error) {
	return a.SignWithFlags(key, data, 0)
}

func (a *connAgent) SignWithFlags(key ssh.PublicKey, data []byte, flags sshagent.SignatureFlags) (*ssh.Signature, error) {
	dest, fwd := a.destination()
	return a.core.sign(signRequest{pub: key, data: data, flags: flags, client: a.client, dest: dest, forwarded: fwd})
}

func (a *connAgent) Add(key sshagent.AddedKey) error { return a.core.addTemp(key) }
func (a *connAgent) Remove(key ssh.PublicKey) error  { return a.core.removeTemp(key) }
func (a *connAgent) RemoveAll() error                { return a.core.removeAllTemp() }
func (a *connAgent) Lock(passphrase []byte) error    { return a.core.protoLock(passphrase) }
func (a *connAgent) Unlock(passphrase []byte) error  { return a.core.protoUnlock(passphrase) }
func (a *connAgent) Signers() ([]ssh.Signer, error)  { return nil, errors.New("agent: not supported") }

func (a *connAgent) Extension(extensionType string, contents []byte) ([]byte, error) {
	if extensionType != extSessionBind {
		return nil, sshagent.ErrExtensionUnsupported
	}
	b, err := parseSessionBind(contents)
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.binds) >= maxBinds {
		return nil, errors.New("agent: too many session binds")
	}
	a.binds = append(a.binds, b)
	return nil, nil
}

// destination names the server the last bind points at; forwarded is true
// when any bind on this connection came through agent forwarding.
func (a *connAgent) destination() (string, bool) {
	a.mu.Lock()
	binds := append([]sessionBind(nil), a.binds...)
	a.mu.Unlock()
	if len(binds) == 0 {
		return "", false
	}
	fwd := false
	for _, b := range binds {
		fwd = fwd || b.forwarding
	}
	last := binds[len(binds)-1].hostKey
	a.core.mu.Lock()
	hosts := a.core.hosts
	a.core.mu.Unlock()
	if hosts != nil {
		if name := hosts.Resolve(last); name != "" {
			return name, fwd
		}
	}
	return "host key " + shortFingerprint(ssh.FingerprintSHA256(last)), fwd
}

func shortFingerprint(fp string) string {
	const keep = len("SHA256:") + 12
	if len(fp) > keep {
		return fp[:keep] + "…"
	}
	return fp
}
