package sshx

import (
	"crypto/x509"
	"errors"
	"io/fs"
	"os"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	"github.com/salawat/sshmgr/internal/domain"
)

// Credentials carries the per-connection secrets the service layer pulls
// from the keychain. It is passed by value and zeroed by the caller after
// use (SEC-10); it is never logged (SEC-06).
type Credentials struct {
	Password   string
	Passphrase string
}

// AuthMethods builds the ordered auth methods for a server. The secrets
// come from Credentials (pulled from the keychain by the service layer),
// never from the Server struct (SEC-01).
func AuthMethods(srv domain.Server, creds Credentials) ([]ssh.AuthMethod, error) {
	switch srv.AuthType {
	case domain.AuthPassword:
		return []ssh.AuthMethod{ssh.Password(creds.Password)}, nil
	case domain.AuthKey:
		signer, err := loadSigner(srv.KeyPath, creds.Passphrase)
		if err != nil {
			return nil, err
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	case domain.AuthAgent:
		m, err := agentAuth()
		if err != nil {
			return nil, err
		}
		return []ssh.AuthMethod{m}, nil
	default:
		return nil, domain.NewError(domain.CodeValidation, "Unknown auth method.")
	}
}

// loadSigner reads and parses a private key, mapping the verified error
// cases to codes. Try a passphrase-less parse first so an unencrypted key
// never trips "key is not password protected".
func loadSigner(keyPath, passphrase string) (ssh.Signer, error) {
	pem, err := os.ReadFile(keyPath) //nolint:gosec // G304: keyPath is the caller's own server profile's configured key path, not attacker input.
	if errors.Is(err, fs.ErrNotExist) {
		return nil, domain.NewError(domain.CodeKeyNotFound, "Key file not found: "+keyPath)
	}
	if err != nil {
		return nil, domain.NewError(domain.CodeKeyNotFound, "Cannot read key file: "+keyPath)
	}

	signer, err := ssh.ParsePrivateKey(pem)
	if err == nil {
		return signer, nil
	}
	var missing *ssh.PassphraseMissingError
	if !errors.As(err, &missing) {
		return nil, domain.NewError(domain.CodeKeyNotFound, "Cannot parse key file: "+keyPath)
	}
	// Encrypted — need the passphrase.
	if passphrase == "" {
		return nil, domain.NewError(domain.CodeKeyPassphrase, "This key needs a passphrase.")
	}
	signer, err = ssh.ParsePrivateKeyWithPassphrase(pem, []byte(passphrase))
	if err != nil {
		if errors.Is(err, x509.IncorrectPasswordError) {
			return nil, domain.NewError(domain.CodeKeyPassphrase, "Wrong passphrase for "+keyPath+".")
		}
		return nil, domain.NewError(domain.CodeKeyPassphrase, "Cannot decrypt key file: "+keyPath)
	}
	return signer, nil
}

// agentAuth connects to the ssh-agent (transport differs by OS — dialAgent
// is build-tagged) and returns a public-key-callback method.
func agentAuth() (ssh.AuthMethod, error) {
	conn, err := dialAgent()
	if err != nil {
		return nil, domain.NewError(domain.CodeAgentUnavail,
			"ssh-agent is not running. Start it or choose another auth method.")
	}
	ag := agent.NewClient(conn)
	return ssh.PublicKeysCallback(ag.Signers), nil
}
