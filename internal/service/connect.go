package service

import (
	"errors"
	"fmt"
	"slices"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// SignerSource hands out in-process signers for Zish agent keys;
// *agent.Core implements it.
type SignerSource interface {
	Signer(keyID string, client agent.ClientInfo) (ssh.Signer, error)
}

// credsFor pulls the secrets this server's auth method needs from the keychain.
// A missing passphrase for a key server is fine (unencrypted key); a missing
// password for a password server is a failure. Shared by TestConnection (which
// dials-and-closes) and resolveChain (tunnels, which keep the client) so the two
// never drift on which secret an auth type needs. purpose labels a Zish-key
// signature in the prompt and the sign log.
func credsFor(sec secret.Store, signers SignerSource, srv *domain.Server, purpose string) (sshx.Credentials, error) {
	var creds sshx.Credentials
	switch srv.AuthType {
	case domain.AuthZishKey:
		if signers == nil {
			return sshx.Credentials{}, domain.NewError(domain.CodeAgentUnavail, "The Zish agent isn't available in this window.")
		}
		if srv.AgentKeyID == nil {
			return sshx.Credentials{}, agent.ErrKeyMissing
		}
		s, err := signers.Signer(*srv.AgentKeyID, agent.ClientInfo{Purpose: purpose, Target: agentTarget(srv)})
		if err != nil {
			return sshx.Credentials{}, err
		}
		creds.AgentSigner = s
	case domain.AuthPassword:
		pw, err := sec.GetPassword(srv.ID)
		if err != nil {
			if errors.Is(err, secret.ErrNotStored) {
				return sshx.Credentials{}, domain.NewError(domain.CodeAuthFailed, "No password is stored for this server.")
			}
			return sshx.Credentials{}, err // ERR_KEYCHAIN
		}
		creds.Password = pw
	case domain.AuthKey:
		phrase, err := sec.GetPassphrase(srv.ID)
		switch {
		case err == nil:
			creds.Passphrase = phrase
		case errors.Is(err, secret.ErrNotStored):
			// unencrypted key — no passphrase, not an error
		default:
			return sshx.Credentials{}, err
		}
	default:
		// agent needs no stored secret
	}

	// TOTP is orthogonal to the primary auth method built above: a password
	// OR key server can ALSO require a 2FA code (TZ 8 addendum). A
	// TwoFactor server with no TOTP secret stored yet (2FA turned on, but
	// the user hasn't entered a secret) is tolerated here — the
	// keyboard-interactive challenge falls back to the interactive
	// CodePrompter for that hop instead of failing the whole connect.
	if srv.TwoFactor {
		if totp, err := sec.GetTOTPSecret(srv.ID); err == nil {
			creds.TOTPSecret = totp
		} else if !errors.Is(err, secret.ErrNotStored) {
			return sshx.Credentials{}, err // ERR_KEYCHAIN
		}
	}

	return creds, nil
}

// maxJumpDepth bounds how many hops resolveChain will walk before giving up —
// a deliberately generous ceiling (real jump chains are 1-3 hops) that exists
// only to turn a misconfigured or maliciously long chain into a fast, clear
// error instead of an unbounded walk.
const maxJumpDepth = 8

// resolveServers walks JumpID from target up to the root jump, guarding
// against cycles and excessive depth. The returned chain is ordered
// root-first, target-last and carries no secrets.
func resolveServers(repo *store.ServerRepo, target *domain.Server) ([]domain.Server, error) {
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
	slices.Reverse(rev)
	return rev, nil
}

// resolveChain is resolveServers plus each hop's credentials, in the order
// DialChain dials.
func resolveChain(repo *store.ServerRepo, sec secret.Store, signers SignerSource, target *domain.Server, purpose string) ([]sshx.Hop, error) {
	servers, err := resolveServers(repo, target)
	if err != nil {
		return nil, err
	}
	chain := make([]sshx.Hop, 0, len(servers))
	for i := range servers {
		creds, err := credsFor(sec, signers, &servers[i], purpose)
		if err != nil {
			return nil, err
		}
		chain = append(chain, sshx.Hop{Server: servers[i], Creds: creds})
	}
	return chain, nil
}

// zeroChainCreds wipes every hop's secret material after dialing (SEC-10).
func zeroChainCreds(chain []sshx.Hop) {
	for i := range chain {
		chain[i].Creds.Password = ""
		chain[i].Creds.Passphrase = ""
		chain[i].Creds.TOTPSecret = ""
		chain[i].Creds.AgentSigner = nil
	}
}
