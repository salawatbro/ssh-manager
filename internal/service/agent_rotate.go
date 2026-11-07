package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// RotateResult is how moving one server to a new key went.
type RotateResult struct {
	// OldKeyRemoved is false when the server already uses the new key but
	// the old one is still in its authorized_keys; Note says why.
	OldKeyRemoved bool   `json:"oldKeyRemoved"`
	Note          string `json:"note"`
}

// removeKeyCommand deletes every authorized_keys line that holds the key
// blob read from stdin, whatever its options or comment. Like
// installKeyCommand it is a constant with no single quote inside; the file is
// rewritten in place so its mode, owner and any symlink stay.
const removeKeyCommand = `sh -c 'f="$HOME/.ssh/authorized_keys"; IFS= read -r b || exit 1; [ -n "$b" ] || exit 1; [ -f "$f" ] || exit 0; grep -qF -- "$b" "$f" || exit 0; t=$(mktemp "$f.XXXXXX") || exit 1; grep -vF -- "$b" "$f" > "$t"; [ $? -le 1 ] && cat "$t" > "$f"; s=$?; rm -f "$t"; exit $s'`

var keyBlobPattern = regexp.MustCompile(`^[A-Za-z0-9+/]{16,}={0,2}$`)

// keyBlob is the base64 field of an authorized_keys line ("type blob").
func keyBlob(publicKey string) (string, error) {
	f := strings.Fields(publicKey)
	if len(f) < 2 || !keyBlobPattern.MatchString(f[1]) {
		return "", domain.NewError(domain.CodeInternal, "The old key's public half is unreadable.")
	}
	return f[1], nil
}

// RotateKeyOnServer moves one server from oldKeyID to newKeyID. Signed in
// with the old key it adds the new one; then it signs in with the new key,
// switches the server to it and only then takes the old key out of
// authorized_keys. Any failure before the switch leaves the server as it was.
func (s *AgentService) RotateKeyOnServer(oldKeyID, newKeyID, serverID string) (*RotateResult, error) {
	if oldKeyID == newKeyID {
		return nil, domain.NewError(domain.CodeValidation, "Pick a different key to rotate to.")
	}
	oldKey, err := s.keys.Get(oldKeyID)
	if err != nil {
		return nil, err
	}
	newKey, err := s.keys.Get(newKeyID)
	if err != nil {
		return nil, err
	}
	if err := domain.ValidateKeyComment(newKey.Comment); err != nil {
		return nil, err
	}
	blob, err := keyBlob(oldKey.PublicKey)
	if err != nil {
		return nil, err
	}
	srv, err := s.servers.Get(serverID)
	if err != nil {
		return nil, err
	}
	if srv.AuthType != domain.AuthZishKey || srv.AgentKeyID == nil || *srv.AgentKeyID != oldKeyID {
		return nil, domain.NewError(domain.CodeValidation, srv.Name+" no longer signs in with "+oldKey.Name+".")
	}
	dialer := s.rt.dialer()
	if dialer == nil {
		return nil, domain.NewError(domain.CodeInternal, "Zish can't connect to servers in this window.")
	}

	conn, err := s.dialServer(dialer, srv)
	if err != nil {
		return nil, err
	}
	out, err := sshx.RunInput(conn.Client, installKeyCommand, []byte(publicKeyLine(newKey)+"\n"), 30*time.Second)
	_ = conn.Close()
	if err != nil {
		return nil, remoteError("The server couldn't add the new key: ", out, err)
	}

	next := *srv
	next.AgentKeyID = &newKeyID
	conn, err = s.dialServer(dialer, &next)
	if err != nil {
		msg := "The new key is on the server, but it couldn't sign in with it, so nothing else changed."
		var de *domain.Error
		if errors.As(err, &de) {
			return nil, domain.NewError(de.Code, msg+" "+de.Message)
		}
		return nil, domain.NewError(domain.CodeInternal, msg)
	}
	defer func() { _ = conn.Close() }()
	if err := s.servers.Update(&next); err != nil {
		return nil, err
	}

	res := &RotateResult{OldKeyRemoved: true}
	if out, err := sshx.RunInput(conn.Client, removeKeyCommand, []byte(blob+"\n"), 30*time.Second); err != nil {
		res.OldKeyRemoved = false
		res.Note = "The old key is still in its authorized_keys: " + reasonOf(out, err)
	}
	return res, nil
}

// dialServer signs in to srv the way it is set up, through its jump hosts.
func (s *AgentService) dialServer(dialer Dialer, srv *domain.Server) (*sshx.Conn, error) {
	chain, err := resolveChain(s.servers, s.secret, s.signers(), srv, "rotate key")
	if err != nil {
		return nil, err
	}
	conn, err := dialer.DialChain(context.Background(), chain)
	zeroChainCreds(chain)
	return conn, err
}

func remoteError(prefix, out string, err error) error {
	var de *domain.Error
	if errors.As(err, &de) {
		return de
	}
	return domain.NewError(domain.CodeInternal, prefix+reasonOf(out, err))
}

func reasonOf(out string, err error) string {
	var de *domain.Error
	if errors.As(err, &de) {
		return de.Message
	}
	if r := agent.Label(strings.TrimSpace(out)); r != "" {
		return r
	}
	return "it failed without a message."
}
