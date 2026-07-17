package service

import (
	"errors"
	"fmt"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
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

// maxJumpDepth bounds how many hops resolveChain will walk before giving up —
// a deliberately generous ceiling (real jump chains are 1-3 hops) that exists
// only to turn a misconfigured or maliciously long chain into a fast, clear
// error instead of an unbounded walk.
const maxJumpDepth = 8

// resolveChain walks JumpID from target up to the root jump, guarding against
// cycles and excessive depth, and loads each hop's credentials. The returned
// chain is ordered root-first, target-last — the order DialChain dials in.
func resolveChain(repo *store.ServerRepo, sec secret.Store, target *domain.Server) ([]sshx.Hop, error) {
	// Walk target -> jump -> jump... collecting target-first, then reverse.
	var rev []domain.Server
	seen := map[string]bool{}
	cur := target
	for {
		if seen[cur.ID] {
			return nil, domain.NewError(domain.CodeJumpCycle,
				"The jump configuration forms a loop; a server cannot jump through itself.")
		}
		seen[cur.ID] = true
		rev = append(rev, *cur)
		if len(rev) > maxJumpDepth {
			return nil, domain.NewError(domain.CodeJumpFailed,
				fmt.Sprintf("The jump chain is too deep (more than %d hops).", maxJumpDepth))
		}
		if cur.JumpID == nil || *cur.JumpID == "" {
			break
		}
		next, err := repo.Get(*cur.JumpID)
		if err != nil {
			return nil, err // ErrNotFound if a jump was deleted out from under us
		}
		cur = next
	}
	// rev is target..root; reverse into root..target and load creds.
	chain := make([]sshx.Hop, 0, len(rev))
	for i := len(rev) - 1; i >= 0; i-- {
		srv := rev[i]
		creds, err := credsFor(sec, &srv)
		if err != nil {
			return nil, err
		}
		chain = append(chain, sshx.Hop{Server: srv, Creds: creds})
	}
	return chain, nil
}

// zeroChainCreds wipes every hop's secret material after dialing (SEC-10).
func zeroChainCreds(chain []sshx.Hop) {
	for i := range chain {
		chain[i].Creds.Password = ""
		chain[i].Creds.Passphrase = ""
	}
}
