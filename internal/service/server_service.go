// Package service exposes the app's operations to the frontend. Wails binds
// these methods directly — there is no HTTP layer (TZ 4.3).
package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// CreateServerInput is what the frontend sends to create or update a server.
type CreateServerInput struct {
	Name     string          `json:"name"`
	Host     string          `json:"host"`
	Port     int             `json:"port"`
	User     string          `json:"user"`
	AuthType domain.AuthType `json:"authType"`
	KeyPath  string          `json:"keyPath"`
	// Password and Passphrase go to the OS keychain and NEVER into the
	// database (SEC-01). toServer() does not read them, so they cannot leak
	// into a domain.Server. An empty value means "do not write / leave
	// unchanged" (an agent server, or an edit that didn't touch the secret).
	Password    string             `json:"password"`
	Passphrase  string             `json:"passphrase"`
	JumpID      *string            `json:"jumpId"`
	Group       string             `json:"group"`
	Environment domain.Environment `json:"environment"`
	Tags        []string           `json:"tags"`
	Notes       string             `json:"notes"`
}

// TestResult is the outcome of TestConnection (FR-04). A connection outcome
// (refused, timed out, auth failed, host key declined, keychain locked) is a
// normal OK:false result carrying Code — not a thrown error — so the
// frontend's result strip can render the TZ 11.2 message for that code.
type TestResult struct {
	OK        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Banner    string `json:"banner"`
	Code      string `json:"code"` // TZ 7.1 extension: the ERR_ code on failure, "" on success
	Error     string `json:"error"`
}

// Dialer is the slice of *sshx.Dialer the service needs. Narrowing it to an
// interface lets the service test inject a fake dialer instead of standing
// up a real in-process SSH server — that end-to-end path is already covered
// exhaustively in internal/sshx. The service test's job is the
// orchestration around it (credsFor pulls the right secret, failResult maps
// codes, the keychain rollback on Create).
type Dialer interface {
	Test(ctx context.Context, srv domain.Server, creds sshx.Credentials) (sshx.DialResult, error)
	Dial(ctx context.Context, srv domain.Server, creds sshx.Credentials) (*ssh.Client, error)
}

// ServerService is bound to the frontend as ServerService.
type ServerService struct {
	repo   *store.ServerRepo
	secret secret.Store
	dialer Dialer
}

// NewServerService wires the service to its repository, the keychain and
// the SSH dialer. *sshx.Dialer satisfies the Dialer interface.
func NewServerService(repo *store.ServerRepo, sec secret.Store, dialer Dialer) *ServerService {
	return &ServerService{repo: repo, secret: sec, dialer: dialer}
}

// List returns every server, ordered for the sidebar.
func (s *ServerService) List() ([]domain.Server, error) {
	return s.repo.List()
}

// Get returns one server by ID.
func (s *ServerService) Get(id string) (*domain.Server, error) {
	return s.repo.Get(id)
}

// Create validates the input and stores a new server.
func (s *ServerService) Create(input CreateServerInput) (*domain.Server, error) {
	srv := input.toServer()
	srv.ID = uuid.NewString()

	// SEC-08: the frontend already validated; do it again here anyway.
	if err := srv.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Create(srv); err != nil {
		return nil, err
	}
	// Secrets go to the keychain after the row exists. If that fails, roll
	// the row back so we never leave a server whose secret could not be
	// saved. SEC-06: input.Password/Passphrase are never logged.
	if err := s.writeSecrets(srv.ID, input); err != nil {
		_ = s.repo.Delete(srv.ID)
		// writeSecrets writes password then passphrase in sequence — a
		// password-ok/passphrase-fail partial write (or vice versa) can
		// leave one secret sitting in the keychain under srv.ID with no row
		// left to reference it. Delete is symmetric with the row rollback
		// above and best-effort for the same reason Delete (the public
		// method) already treats keychain cleanup as best-effort: the row is
		// already gone, so a cleanup failure here must not resurrect it or
		// block the caller from seeing the original writeSecrets error.
		_ = s.secret.Delete(srv.ID)
		return nil, err
	}
	return srv, nil
}

// writeSecrets stores whatever secrets the input carries. Empty values are
// skipped (leave the keychain untouched) — an agent server has neither, and
// an edit that didn't touch the secret sends it back empty.
func (s *ServerService) writeSecrets(id string, input CreateServerInput) error {
	if input.Password != "" {
		if err := s.secret.SetPassword(id, input.Password); err != nil {
			return err
		}
	}
	if input.Passphrase != "" {
		if err := s.secret.SetPassphrase(id, input.Passphrase); err != nil {
			return err
		}
	}
	return nil
}

// Update overwrites an existing server's editable fields.
//
// This is a full replace of the FORM fields, not a patch. Usage state
// (last_used_at, use_count, sort_order) is intentionally NOT written by
// Update — the repository's updatableColumns excludes it, and BumpUsage
// owns it — so the form can no longer clobber a connection bump. CreatedAt
// is carried over defensively (it is not in updatableColumns either).
func (s *ServerService) Update(id string, input CreateServerInput) (*domain.Server, error) {
	existing, err := s.repo.Get(id)
	if err != nil {
		return nil, err
	}

	srv := input.toServer()
	srv.ID = id
	srv.CreatedAt = existing.CreatedAt

	if err := srv.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Update(srv); err != nil {
		return nil, err
	}
	// Empty Password/Passphrase leave the keychain unchanged (the edit form
	// didn't touch the secret); a non-empty value overwrites it.
	if err := s.writeSecrets(id, input); err != nil {
		return nil, err
	}
	// Return the freshly stored row so the caller sees the real usage
	// state, which Update did not touch.
	return s.repo.Get(id)
}

// Delete removes a server and its keychain secrets (FR-01.3, FR-03.4). A
// server still referenced as another server's jump host is refused with a
// clear validation error instead of letting the FK constraint fail the
// delete (or the dependent's JumpID dangle).
func (s *ServerService) Delete(id string) error {
	n, err := s.repo.CountByJumpID(id)
	if err != nil {
		return err
	}
	if n > 0 {
		return domain.NewError(domain.CodeValidation,
			fmt.Sprintf("This server is used as a jump host by %d other server(s). Change those first.", n))
	}

	if err := s.repo.Delete(id); err != nil {
		return err
	}
	// The row is gone; a keychain cleanup failure must not resurrect it.
	// Best-effort: the secret is now unreachable (no server references it)
	// and will be overwritten if the same UUID ever recurs (it won't).
	_ = s.secret.Delete(id)
	return nil
}

// nameCopySuffix is appended to a duplicated server's name (FR-01.4).
const nameCopySuffix = " copy"

// maxNameRunes mirrors the 64-rune cap domain.Server.Validate enforces on
// Name. It is duplicated here (not imported) because domain exposes no
// constant for it; if that limit ever changes, this must move with it.
const maxNameRunes = 64

// Duplicate copies a server under the name "{name} copy" (FR-01.4).
func (s *ServerService) Duplicate(id string) (*domain.Server, error) {
	src, err := s.repo.Get(id)
	if err != nil {
		return nil, err
	}

	dup := *src
	dup.ID = uuid.NewString()
	dup.Name = duplicateName(src.Name)
	// A copy has never been connected to.
	dup.UseCount = 0
	dup.LastUsedAt = nil
	dup.Jump = nil
	// The keychain secret is deliberately NOT copied to the new ID: silently
	// cloning a password/passphrase the user never re-entered runs against
	// the spirit of SEC-01 and would surprise them (a "copy" that can
	// authenticate before they've touched it). The user re-enters the
	// secret for the duplicate, same as any other new server.

	if err := dup.Validate(); err != nil {
		return nil, err
	}
	if err := s.repo.Create(&dup); err != nil {
		return nil, err
	}
	return &dup, nil
}

// duplicateName appends nameCopySuffix to base, truncating base first if the
// result would exceed maxNameRunes.
//
// Truncation counts runes, not bytes: base can be Cyrillic or emoji, and
// slicing a byte string can split a multi-byte rune. Without this, any
// source name within len(nameCopySuffix) runes of the 64 cap fails
// Duplicate's validation — telling the user their name is too long when they
// never typed one; they clicked Duplicate on a server whose name was already
// valid. Duplicate must always succeed on a valid source.
func duplicateName(base string) string {
	limit := maxNameRunes - len([]rune(nameCopySuffix))
	runes := []rune(base)
	if len(runes) > limit {
		runes = runes[:limit]
	}
	return string(runes) + nameCopySuffix
}

// SSHCommand renders the openssh equivalent for the clipboard (FR-01.9).
func (s *ServerService) SSHCommand(id string) (string, error) {
	srv, err := s.repo.Get(id)
	if err != nil {
		return "", err
	}

	var jump *domain.Server
	if srv.JumpID != nil {
		j, err := s.repo.Get(*srv.JumpID)
		if err != nil {
			// jump_id is a RESTRICT foreign key with foreign_keys enforcement
			// on, so domain.ErrNotFound here cannot happen through normal
			// use — this fallback is cheap insurance in case that ever
			// changes, not a real scenario today. Anything else reaching
			// this point is a genuine infra fault (a locked or corrupt
			// database) and must surface, not be silently swallowed into a
			// command that's missing the -J the user actually needs.
			if !errors.Is(err, domain.ErrNotFound) {
				return "", err
			}
		} else {
			jump = j
		}
	}
	return SSHCommand(*srv, jump), nil
}

// Groups returns the distinct group names in use, for the sidebar headers.
func (s *ServerService) Groups() ([]string, error) {
	return s.repo.Groups()
}

// TestConnection opens a connection to verify the server works (FR-04),
// running the full host-key flow, then closes it. A connection outcome
// (refused, auth failed, host key declined, keychain locked) is a normal
// failed TestResult; only a missing server id is a thrown error.
//
// No ctx timeout is imposed here — the dialer owns the whole connect
// ceiling via its own handshakeDeadline (internal/sshx.Dialer), which is
// deliberately longer than the network-only FR-04.3 timeout (that one now
// lives as the dialer's dialTimeout, configurable in v0.5) so a legitimate
// host-key prompt (up to 60s) is never killed mid-decision. A ctx timeout
// here would re-impose a second, shorter ceiling on top of that one.
func (s *ServerService) TestConnection(id string) (*TestResult, error) {
	srv, err := s.repo.Get(id)
	if err != nil {
		return nil, err
	}
	creds, err := credsFor(s.secret, srv)
	if err != nil {
		return failResult(err), nil
	}

	res, dialErr := s.dialer.Test(context.Background(), *srv, creds)
	// SEC-10: do not keep the plaintext secrets around after use.
	creds.Password, creds.Passphrase = "", ""
	if dialErr != nil {
		return failResult(dialErr), nil
	}
	return &TestResult{OK: true, LatencyMs: res.LatencyMs, Banner: res.Banner}, nil
}

// failResult turns a coded domain error into a failed TestResult so the
// frontend strip can show the code's message.
func failResult(err error) *TestResult {
	var de *domain.Error
	if errors.As(err, &de) {
		return &TestResult{OK: false, Code: de.Code, Error: de.Message}
	}
	return &TestResult{OK: false, Code: domain.CodeConnRefused, Error: err.Error()}
}

// DetectKeys lists likely private keys in ~/.ssh (FR-02.5).
func (s *ServerService) DetectKeys() ([]sshx.KeyInfo, error) {
	return sshx.DetectKeys()
}

// ExportJSON writes all servers as JSON to path (FR-12 Data). Secrets stay in
// the keychain; only server profiles are written.
func (s *ServerService) ExportJSON(path string) error {
	servers, err := s.repo.List()
	if err != nil {
		return err
	}
	b, err := ExportServersJSON(servers)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, b, 0o600); err != nil {
		return domain.NewError(domain.CodeValidation, "Cannot write the export file. Check the folder is writable.")
	}
	return nil
}

// ImportJSON reads a server-JSON file, validates every entry (SEC-07), skips
// duplicates (same host/port/user) — both against servers already in the
// database and against ones created earlier in this same import — and
// creates the rest. Returns the count created.
func (s *ServerService) ImportJSON(path string) (int, error) {
	b, err := os.ReadFile(path) //nolint:gosec // user-chosen path via native dialog
	if err != nil {
		return 0, domain.NewError(domain.CodeValidation, "Cannot read the file.")
	}
	incoming, err := ParseServersJSON(b)
	if err != nil {
		return 0, err
	}
	existing, err := s.repo.List()
	if err != nil {
		return 0, err
	}
	count := 0
	for i := range incoming {
		srv := incoming[i]
		if serversDuplicate(existing, srv) {
			continue
		}
		srv.ID = uuid.NewString()
		srv.JumpID = nil // imported JSON may reference ids that don't exist here
		if err := s.repo.Create(&srv); err != nil {
			return count, err
		}
		count++
		// Track this newly created server so a later duplicate entry in the
		// SAME file is also skipped, not just ones already in the database.
		existing = append(existing, srv)
	}
	return count, nil
}

func serversDuplicate(existing []domain.Server, s domain.Server) bool {
	for _, e := range existing {
		if e.Host == s.Host && e.Port == s.Port && e.User == s.User {
			return true
		}
	}
	return false
}

// toServer maps the input onto a domain server, applying defaults.
func (in CreateServerInput) toServer() *domain.Server {
	port := in.Port
	if port == 0 {
		port = 22 // FR-01 validation table: default 22
	}
	env := in.Environment
	if env == "" {
		env = domain.EnvNone
	}
	auth := in.AuthType
	if auth == "" {
		auth = domain.AuthPassword
	}

	return &domain.Server{
		Name:        strings.TrimSpace(in.Name),
		Host:        strings.TrimSpace(in.Host),
		Port:        port,
		User:        strings.TrimSpace(in.User),
		AuthType:    auth,
		KeyPath:     strings.TrimSpace(in.KeyPath),
		JumpID:      in.JumpID,
		GroupName:   strings.TrimSpace(in.Group),
		Environment: env,
		Tags:        strings.Join(in.Tags, ","),
		Notes:       in.Notes,
	}
}
