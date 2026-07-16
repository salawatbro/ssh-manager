package service

import (
	"errors"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
)

// credsFor pulls the secrets this server's auth method needs from the keychain.
// A missing passphrase for a key server is fine (unencrypted key); a missing
// password for a password server is a failure. Shared by TestConnection (which
// dials-and-closes) and SSHService.Open (which keeps the client) so the two
// never drift on which secret an auth type needs.
func credsFor(sec secret.Store, srv *domain.Server) (sshx.Credentials, error) {
	switch srv.AuthType {
	case domain.AuthPassword:
		pw, err := sec.GetPassword(srv.ID)
		if err != nil {
			if errors.Is(err, secret.ErrNotStored) {
				return sshx.Credentials{}, domain.NewError(domain.CodeAuthFailed, "No password is stored for this server.")
			}
			return sshx.Credentials{}, err // ERR_KEYCHAIN
		}
		return sshx.Credentials{Password: pw}, nil
	case domain.AuthKey:
		phrase, err := sec.GetPassphrase(srv.ID)
		if err != nil {
			if errors.Is(err, secret.ErrNotStored) {
				return sshx.Credentials{}, nil // unencrypted key — no passphrase
			}
			return sshx.Credentials{}, err
		}
		return sshx.Credentials{Passphrase: phrase}, nil
	default:
		return sshx.Credentials{}, nil // agent needs no stored secret
	}
}
