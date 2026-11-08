package agent

import (
	"bytes"
	"encoding/binary"
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
	host, verified, fwd := a.destination(data)
	return a.core.sign(signRequest{pub: key, data: data, flags: flags, client: a.client, host: host, verified: verified, forwarded: fwd})
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

// destination names the server a request signs for. A bind whose session id
// opens the signed userauth request proves it (verified); otherwise the last
// bind is shown, unproven. forwarded: any bind came through agent forwarding.
func (a *connAgent) destination(data []byte) (host Host, verified, forwarded bool) {
	a.mu.Lock()
	binds := append([]sessionBind(nil), a.binds...)
	a.mu.Unlock()
	for _, b := range binds {
		forwarded = forwarded || b.forwarding
	}
	if ns, ok := sshsigNamespace(data); ok {
		return Host{Name: Label(ns) + " signature"}, false, forwarded
	}
	if len(binds) == 0 {
		return Host{}, false, false
	}
	pick := binds[len(binds)-1]
	if sid, ok := userauthSessionID(data); ok {
		for i := len(binds) - 1; i >= 0; i-- {
			if bytes.Equal(binds[i].sessionID, sid) {
				pick, verified = binds[i], true
				break
			}
		}
	}
	return a.core.describeHost(pick.hostKey), verified, forwarded
}

// userauthSessionID returns the session id that opens an SSH userauth
// request (RFC 4252 §7), the data ssh asks the agent to sign.
func userauthSessionID(data []byte) ([]byte, bool) {
	const msgUserauthRequest = 50
	if len(data) < 4 {
		return nil, false
	}
	n := binary.BigEndian.Uint32(data)
	if n == 0 || uint64(len(data)) < 4+uint64(n)+1 || data[4+n] != msgUserauthRequest {
		return nil, false
	}
	return data[4 : 4+n], true
}

// sshsigNamespace returns the namespace of the blob "ssh-keygen -Y sign"
// asks the agent to sign (PROTOCOL.sshsig), such as "git" for a commit.
func sshsigNamespace(data []byte) (string, bool) {
	rest, ok := bytes.CutPrefix(data, []byte("SSHSIG"))
	if !ok || len(rest) < 4 {
		return "", false
	}
	n := binary.BigEndian.Uint32(rest)
	if n == 0 || uint64(len(rest)) < 4+uint64(n) {
		return "", false
	}
	return string(rest[4 : 4+n]), true
}

func shortFingerprint(fp string) string {
	const keep = len("SHA256:") + 12
	if len(fp) > keep {
		return fp[:keep] + "…"
	}
	return fp
}
