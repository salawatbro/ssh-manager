// Package service exposes the app's operations to the frontend. Wails binds
// these methods directly — there is no HTTP layer (TZ 4.3).
package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

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
	Password   string `json:"password"`
	Passphrase string `json:"passphrase"`
	// TOTPSecret, like Password/Passphrase, goes to the OS keychain and
	// NEVER into the database (SEC-01): toServer() does not read it, and
	// writeSecrets normalises/validates it through domain.ParseTOTPSecret
	// before storing. An empty value means "do not write / leave
	// unchanged" (same rule as Password). TwoFactor marks the server as
	// requiring a code at connect time and IS a normal row column (unlike
	// the secret itself) — see domain.Server.TwoFactor.
	TOTPSecret  string             `json:"totpSecret"`
	TwoFactor   bool               `json:"twoFactor"`
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
	DialChain(ctx context.Context, chain []sshx.Hop) (*sshx.Conn, error)
}

// forwardStopper stops any running tunnel for a forward id. ServerService uses
// it so deleting a server also tears down its live tunnels (their rows CASCADE,
// but the Manager holds the live runners). *forward.Manager satisfies it via
// Stop — kept as a local interface (not an import of internal/forward) so
// this package stays free of that dependency; Task 6 wires the concrete
// *forward.Manager in via SetForwardDeps.
type forwardStopper interface {
	Stop(forwardID string) error
}

// ServerService is bound to the frontend as ServerService.
type ServerService struct {
	repo   *store.ServerRepo
	secret secret.Store
	dialer Dialer

	// forwards and stopper are both nil until SetForwardDeps is called (or
	// forever, for callers that never wire tunnels at all — see e.g. every
	// existing test in this package and, until Task 6, main.go). Delete
	// treats either being nil as "no tunnel teardown to do" rather than
	// panicking, so the plain 3-arg NewServerService path keeps working
	// unchanged.
	forwards *store.ForwardRepo
	stopper  forwardStopper

	// onServersChanged, when set (SetOnServersChanged), fires after any change
	// to the server set the menu-bar tray reflects: SetPinned, Update, Delete.
	// nil for every non-tray caller (all tests) — then notify is a no-op.
	onServersChanged func()
}

// NewServerService wires the service to its repository, the keychain and
// the SSH dialer. *sshx.Dialer satisfies the Dialer interface.
//
// This intentionally stays a 3-arg constructor: it is called by every
// existing test in this package plus main.go, and forcing a 4th parameter
// here for the tunnel-teardown deps would mean editing every one of those
// call sites for a capability most of them don't need. SetForwardDeps below
// is the low-blast-radius way to add it — main.go's Task 6 wiring is the
// only caller that needs it before v0.7 ships.
func NewServerService(repo *store.ServerRepo, sec secret.Store, dialer Dialer) *ServerService {
	return &ServerService{repo: repo, secret: sec, dialer: dialer}
}

// SetForwardDeps wires the forward lister and tunnel stopper Delete uses to
// tear down a server's live tunnels before removing its row. Called once
// from main.go's wiring (Task 6); left unset, Delete skips tunnel teardown
// entirely (see the forwards/stopper doc on ServerService).
//
// Deliberately a package-level function, not a method on *ServerService:
// main.go binds ServerService to the frontend with
// application.NewService(serverService), which auto-generates a callable
// frontend RPC binding for every EXPORTED METHOD of the bound type. A
// SetForwardDeps *method* was tried first and confirmed (by building and
// inspecting the regenerated frontend/bindings/.../serverservice.ts) to leak
// exactly that: a spurious ServerService.SetForwardDeps() call the frontend
// could invoke, wiring nothing usable (its params have no sane JS
// construction) but bloating the public binding surface with an
// internal-only Go wiring seam. A package-level function needs to stay
// exported for main.go (a different package) to call it, but is invisible
// to the generator, which only walks the bound type's method set — so this
// keeps the capability without adding to the frontend-callable surface.
func SetForwardDeps(s *ServerService, forwards *store.ForwardRepo, stopper forwardStopper) {
	s.forwards = forwards
	s.stopper = stopper
}

// maxPinned caps how many servers show in the menu-bar tray's quick-connect
// list. SetPinned refuses the (maxPinned+1)-th pin; PinnedForTray also truncates.
const maxPinned = 5

// SetOnServersChanged registers the tray-rebuild callback. Package-level, not a
// method, for the SAME reason as SetForwardDeps: application.NewService binds
// every EXPORTED METHOD to the frontend, and a method here would leak a
// spurious, unusable ServerService binding (a func param has no JS
// construction). A package-level function stays callable by main.go yet
// invisible to the binding generator.
func SetOnServersChanged(s *ServerService, fn func()) {
	s.onServersChanged = fn
}

func (s *ServerService) notifyServersChanged() {
	if s.onServersChanged != nil {
		s.onServersChanged()
	}
}

// SetPinned pins or unpins a server for the menu-bar tray. Pinning is capped at
// maxPinned; the next pin is refused with a validation error the frontend
// surfaces. Re-pinning an already-pinned server and unpinning are always
// allowed. A successful change fires onServersChanged so the tray rebuilds.
func (s *ServerService) SetPinned(id string, pinned bool) error {
	if pinned {
		srv, err := s.repo.Get(id)
		if err != nil {
			return err
		}
		if !srv.Pinned {
			n, err := s.repo.CountPinned()
			if err != nil {
				return err
			}
			if n >= maxPinned {
				return domain.NewError(domain.CodeValidation,
					"You can pin up to 5 servers to the tray. Unpin one first.")
			}
		}
	}
	if err := s.repo.SetPinned(id, pinned); err != nil {
		return err
	}
	s.notifyServersChanged()
	return nil
}

// PinnedForTray returns the servers to show in the menu-bar tray: those the
// user pinned, in the given order, capped at maxPinned. Pure (no repo access)
// so it stays trivially testable; main.go feeds it serverService.List(). The
// cap is belt-and-suspenders — SetPinned already refuses a 6th pin, but a
// hand-edited database must never flood the menu.
func PinnedForTray(servers []domain.Server) []domain.Server {
	out := make([]domain.Server, 0, maxPinned)
	for _, srv := range servers {
		if !srv.Pinned {
			continue
		}
		out = append(out, srv)
		if len(out) == maxPinned {
			break
		}
	}
	return out
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
	if input.TOTPSecret != "" {
		normalised, err := domain.ParseTOTPSecret(input.TOTPSecret)
		if err != nil {
			return domain.NewError(domain.CodeValidation,
				"The TOTP secret is not valid. Check it was copied correctly.")
		}
		if err := s.secret.SetTOTPSecret(id, normalised); err != nil {
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
	s.notifyServersChanged()
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

	// Stop this server's live tunnels before the row (and its forward rows,
	// via CASCADE) disappear. Deliberately after the RESTRICT guard above —
	// a delete refused because the server is still in use as a jump host
	// must stop NOTHING — and deliberately before repo.Delete, so the
	// stopper still has a real forward id to key its runner lookup on. Both
	// the list and each stop are best-effort: a listing error must not
	// block the delete, and a runner that's already stopped (or was never
	// started) is not a failure either.
	if s.forwards != nil && s.stopper != nil {
		fwds, _ := s.forwards.List(id)
		for _, f := range fwds {
			_ = s.stopper.Stop(f.ID)
		}
	}

	if err := s.repo.Delete(id); err != nil {
		return err
	}
	// The row is gone; a keychain cleanup failure must not resurrect it.
	// Best-effort: the secret is now unreachable (no server references it)
	// and will be overwritten if the same UUID ever recurs (it won't).
	_ = s.secret.Delete(id)
	s.notifyServersChanged()
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

// TOTPCodeView is one server's current verification code for the authenticator
// panel. It carries the DERIVED code only — never the secret (SEC-01).
type TOTPCodeView struct {
	ServerID   string `json:"serverId"`
	ServerName string `json:"serverName"`
	Code       string `json:"code"`      // 6 digits
	ExpiresIn  int    `json:"expiresIn"` // seconds until the 30s window rolls (1..30)
}

// TOTPCodes returns the current TOTP code for every server that has 2FA enabled
// and a stored secret. Secrets stay in the keychain — only the derived codes are
// returned (SEC-01). It is best-effort: a server whose secret is missing or
// unreadable, or whose code fails to compute, is skipped rather than failing the
// whole list.
func (s *ServerService) TOTPCodes() ([]TOTPCodeView, error) {
	servers, err := s.repo.List()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	expiresIn := 30 - int(now.Unix()%30)
	out := []TOTPCodeView{}
	for i := range servers {
		srv := servers[i]
		if !srv.TwoFactor {
			continue
		}
		secret, err := s.secret.GetTOTPSecret(srv.ID)
		if err != nil {
			continue // ErrNotStored or a keychain fault — skip (best-effort)
		}
		// secret is a local read only by TOTPCode and never retained past this
		// iteration (Go can't scrub an immutable string's bytes anyway); it goes
		// out of scope here and is GC'd — no copy is kept.
		code, err := domain.TOTPCode(secret, now)
		if err != nil {
			continue
		}
		out = append(out, TOTPCodeView{
			ServerID:   srv.ID,
			ServerName: srv.Name,
			Code:       code,
			ExpiresIn:  expiresIn,
		})
	}
	return out, nil
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
	// SEC-10: do not keep the plaintext secrets around after use. TOTPSecret
	// too — credsFor attaches it for a 2FA server, and it is the longest-lived
	// of the three seeds (mirrors zeroChainCreds on the Open path).
	creds.Password, creds.Passphrase, creds.TOTPSecret = "", "", ""
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
		TwoFactor:   in.TwoFactor,
		JumpID:      in.JumpID,
		GroupName:   strings.TrimSpace(in.Group),
		Environment: env,
		Tags:        strings.Join(in.Tags, ","),
		Notes:       in.Notes,
	}
}
