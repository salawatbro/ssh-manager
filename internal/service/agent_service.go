package service

import (
	"context"
	"crypto"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// GenerateKeyInput is what the Generate key form sends.
type GenerateKeyInput struct {
	Name           string `json:"name"`
	Type           string `json:"type"` // "ed25519" | "ecdsa-p256" | "rsa-4096"
	Comment        string `json:"comment"`
	RequireConfirm bool   `json:"requireConfirm"`
}

// ImportKeyInput is what the Import key form sends.
type ImportKeyInput struct {
	Path           string `json:"path"`
	Passphrase     string `json:"passphrase"` // used once, never stored
	Name           string `json:"name"`
	RequireConfirm bool   `json:"requireConfirm"`
}

// KeyFileInfo describes a private key file before import.
type KeyFileInfo struct {
	Type      string `json:"type"`
	Encrypted bool   `json:"encrypted"`
	Comment   string `json:"comment"`
	Supported bool   `json:"supported"`
	Reason    string `json:"reason"` // why unsupported
}

// maxKeyFileBytes bounds a private key file read for import.
const maxKeyFileBytes = 64 << 10

// AgentService manages the agent's keys and reports its state. Bound to the
// frontend as AgentService.
type AgentService struct {
	keys    *store.AgentKeyRepo
	log     *store.SignLogRepo
	servers *store.ServerRepo
	secret  secret.Store
	pubDir  string

	rt        agentRuntime
	approvals approvalBroker
}

// NewAgentService wires the repositories, the Keychain and the folder for
// public-key files. The agent runtime comes later through SetAgentDeps.
func NewAgentService(keys *store.AgentKeyRepo, log *store.SignLogRepo, servers *store.ServerRepo, sec secret.Store, pubDir string) *AgentService {
	return &AgentService{keys: keys, log: log, servers: servers, secret: sec, pubDir: pubDir}
}

// ListKeys returns the stored keys, by name.
func (s *AgentService) ListKeys() ([]domain.AgentKey, error) { return s.keys.List() }

// Generate creates a key in Go and stores it in the Keychain.
func (s *AgentService) Generate(in GenerateKeyInput) (*domain.AgentKey, error) {
	name := strings.TrimSpace(in.Name)
	if err := domain.ValidateKeyName(name); err != nil {
		return nil, err
	}
	comment := strings.TrimSpace(in.Comment)
	if comment == "" {
		comment = name + "@zish"
	}
	key, err := agent.Generate(in.Type)
	if err != nil {
		return nil, err
	}
	return s.store(key, name, comment, in.RequireConfirm)
}

// InspectFile reports what a key file is before import.
func (s *AgentService) InspectFile(path string) (*KeyFileInfo, error) {
	data, err := readKeyFile(path)
	if err != nil {
		return nil, err
	}
	pub, _ := readKeyFile(path + ".pub")
	i := agent.Inspect(data, pub)
	return &KeyFileInfo{Type: i.Type, Encrypted: i.Encrypted, Comment: i.Comment, Supported: i.Supported, Reason: i.Reason}, nil
}

// Import copies a private key file into the Keychain. The file is left in
// place; the passphrase is used once and never stored.
func (s *AgentService) Import(in ImportKeyInput) (*domain.AgentKey, error) {
	data, err := readKeyFile(in.Path)
	if err != nil {
		return nil, err
	}
	defer clear(data)
	key, err := agent.ParsePrivateKey(data, []byte(in.Passphrase))
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = filepath.Base(in.Path)
	}
	return s.store(key, name, siblingComment(in.Path, key), in.RequireConfirm)
}

func readKeyFile(path string) ([]byte, error) {
	f, err := os.Open(path) //nolint:gosec // G304: a path the user picked in the native dialog
	if err != nil {
		return nil, domain.NewError(domain.CodeKeyImport, "Can't read the key file. Check that it exists and is readable.")
	}
	defer func() { _ = f.Close() }()
	data, err := io.ReadAll(io.LimitReader(f, maxKeyFileBytes+1))
	if err != nil || len(data) > maxKeyFileBytes {
		return nil, domain.NewError(domain.CodeKeyImport, "This file is too large to be a private key.")
	}
	return data, nil
}

// siblingComment is the comment of <path>.pub when it holds key's public key.
func siblingComment(path string, key crypto.Signer) string {
	data, err := readKeyFile(path + ".pub")
	if err != nil {
		return ""
	}
	pub, comment, _, _, err := ssh.ParseAuthorizedKey(data)
	want, err2 := ssh.NewPublicKey(key.Public())
	if err != nil || err2 != nil || string(pub.Marshal()) != string(want.Marshal()) {
		return ""
	}
	if domain.ValidateKeyComment(comment) != nil {
		return ""
	}
	return comment
}

// store validates, writes the Keychain item, then the row, then the pub file.
func (s *AgentService) store(key crypto.Signer, name, comment string, requireConfirm bool) (*domain.AgentKey, error) {
	row := domain.AgentKey{Name: name, Comment: comment, RequireConfirm: requireConfirm}
	if err := row.Validate(); err != nil {
		return nil, err
	}
	if err := s.nameFree(row.Name, ""); err != nil {
		return nil, err
	}
	pub, err := ssh.NewPublicKey(key.Public())
	if err != nil {
		return nil, domain.NewError(domain.CodeKeyImport, "This key type isn't supported.")
	}
	row.Type, row.Bits, row.Fingerprint, row.PublicKey = agent.Describe(pub)
	if dup, err := s.keys.GetByFingerprint(row.Fingerprint); err == nil {
		return nil, domain.NewError(domain.CodeValidation, "Already in Zish as “"+dup.Name+"”.")
	}
	der, err := agent.MarshalPKCS8(key)
	if err != nil {
		return nil, domain.NewError(domain.CodeKeyImport, "This key type isn't supported.")
	}
	defer clear(der)
	row.ID = uuid.NewString()
	row.CreatedAt = time.Now()
	if err := s.secret.SetAgentKey(row.ID, der); err != nil {
		return nil, err
	}
	if err := s.keys.Create(&row); err != nil {
		_ = s.secret.DeleteAgentKey(row.ID)
		return nil, err
	}
	_ = s.writePubFile(&row) // best effort: regenerated at launch
	return &row, nil
}

func (s *AgentService) nameFree(name, selfID string) error {
	k, err := s.keys.GetByName(name)
	if errors.Is(err, store.ErrKeyNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if k.ID != selfID {
		return domain.NewError(domain.CodeValidation, "Another key is already called “"+k.Name+"”.")
	}
	return nil
}

// Rename changes a key's display name; the comment stays.
func (s *AgentService) Rename(id, name string) (*domain.AgentKey, error) {
	name = strings.TrimSpace(name)
	if err := domain.ValidateKeyName(name); err != nil {
		return nil, err
	}
	if err := s.nameFree(name, id); err != nil {
		return nil, err
	}
	if err := s.keys.UpdateName(id, name); err != nil {
		return nil, err
	}
	k, err := s.keys.Get(id)
	if err == nil {
		_ = s.writePubFile(k)
	}
	return k, err
}

// SetRequireConfirm switches the per-use confirmation for a key.
func (s *AgentService) SetRequireConfirm(id string, require bool) (*domain.AgentKey, error) {
	if err := s.keys.UpdateRequireConfirm(id, require); err != nil {
		return nil, err
	}
	// Approvals opened under the old setting must not outlive it.
	if c := s.rt.core(); c != nil {
		c.Forget(id)
	}
	return s.keys.Get(id)
}

// UsedBy lists the servers that authenticate with the key.
func (s *AgentService) UsedBy(id string) ([]domain.Server, error) {
	return s.servers.ListByAgentKey(id)
}

// Delete removes a key no server uses: Keychain item, row, pub file, cache.
func (s *AgentService) Delete(id string) error {
	if _, err := s.keys.Get(id); err != nil {
		return err
	}
	used, err := s.servers.ListByAgentKey(id)
	if err != nil {
		return err
	}
	if len(used) > 0 {
		return domain.NewError(domain.CodeAgentKeyInUse, "Used by "+serverNames(used, 5)+". Switch those servers to another key first.")
	}
	if err := s.secret.DeleteAgentKey(id); err != nil {
		return err
	}
	if err := s.keys.Delete(id); err != nil {
		return err
	}
	_ = os.Remove(s.pubKeyPath(id))
	if c := s.rt.core(); c != nil {
		c.Forget(id)
	}
	return nil
}

func serverNames(list []domain.Server, limit int) string {
	names := make([]string, 0, limit)
	for i, srv := range list {
		if i == limit {
			break
		}
		names = append(names, srv.Name)
	}
	out := strings.Join(names, ", ")
	if extra := len(list) - len(names); extra > 0 {
		out += fmt.Sprintf(" and %d more", extra)
	}
	return out
}

// PublicKeyLine returns the authorized_keys line with the key's comment.
func (s *AgentService) PublicKeyLine(id string) (string, error) {
	k, err := s.keys.Get(id)
	if err != nil {
		return "", err
	}
	return publicKeyLine(k), nil
}

func publicKeyLine(k *domain.AgentKey) string {
	if k.Comment == "" {
		return k.PublicKey
	}
	return k.PublicKey + " " + k.Comment
}

// SignLog returns the newest sign events, newest first.
func (s *AgentService) SignLog(limit int) ([]domain.AgentSignEvent, error) { return s.log.List(limit) }

// ClearSignLog deletes the whole sign log.
func (s *AgentService) ClearSignLog() error { return s.log.DeleteAll() }

// installKeyCommand appends one authorized_keys line read from stdin, unless
// it is already there. It is a constant: the key travels only on stdin, and
// the inner script has no single quote, so any login shell parses it.
const installKeyCommand = `sh -c 'umask 077; mkdir -p "$HOME/.ssh" || exit 1; f="$HOME/.ssh/authorized_keys"; IFS= read -r line || exit 1; if [ -f "$f" ] && grep -qxF -- "$line" "$f"; then exit 0; fi; if [ -s "$f" ] && [ -n "$(tail -c1 "$f")" ]; then echo >> "$f"; fi; printf "%s\n" "$line" >> "$f"'`

// InstallPublicKey adds the key to the server's ~/.ssh/authorized_keys. With
// an empty password Zish signs in the way the server is set up; otherwise the
// server itself takes that password just this once and nothing is stored.
func (s *AgentService) InstallPublicKey(keyID, serverID, password string) error {
	k, err := s.keys.Get(keyID)
	if err != nil {
		return err
	}
	if err := domain.ValidateKeyComment(k.Comment); err != nil {
		return err
	}
	srv, err := s.servers.Get(serverID)
	if err != nil {
		return err
	}
	dialer := s.rt.dialer()
	if dialer == nil {
		return domain.NewError(domain.CodeInternal, "Zish can't connect to servers in this window.")
	}
	chain, err := resolveChain(s.servers, s.secret, s.signers(), srv, "install public key")
	if err != nil {
		return err
	}
	if password != "" {
		signInOnceWithPassword(chain, password)
	}
	conn, err := dialer.DialChain(context.Background(), chain)
	zeroChainCreds(chain)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()
	out, err := sshx.RunInput(conn.Client, installKeyCommand, []byte(publicKeyLine(k)+"\n"), 30*time.Second)
	if err != nil {
		var de *domain.Error
		if errors.As(err, &de) {
			return de
		}
		return domain.NewError(domain.CodeInternal, "The server couldn't add the key: "+agent.Label(strings.TrimSpace(out)))
	}
	return nil
}

// signInOnceWithPassword switches the chain's last hop to password sign-in.
// Jump hops keep their own method; a stored TOTP secret still answers 2FA.
func signInOnceWithPassword(chain []sshx.Hop, password string) {
	t := &chain[len(chain)-1]
	t.Server.AuthType = domain.AuthPassword
	t.Creds.Password = password
	t.Creds.Passphrase = ""
	t.Creds.AgentSigner = nil
}
