package service

import (
	"errors"
	"regexp"

	"golang.org/x/crypto/bcrypt"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

// pinRe is the app-lock PIN format: exactly six digits.
var pinRe = regexp.MustCompile(`^[0-9]{6}$`)

// LockService owns the app-lock PIN. The PIN is stored only as a bcrypt hash
// in the Keychain (via secret.Store) — never in the DB, never in an event or
// log. It is the layer the frontend calls to set, verify, change and remove
// the PIN, and to factory-reset the app when the PIN is forgotten.
type LockService struct {
	secret   secret.Store
	servers  *store.ServerRepo
	snippets *store.SnippetRepo
	sessions *store.SessionStateRepo
	logs     *store.SessionLogRepo
	settings *store.SettingsRepo
}

// NewLockService constructs the service. The repo arguments are only used by
// ResetAll — PIN-only callers may pass nil for all of them.
func NewLockService(sec secret.Store, servers *store.ServerRepo, snippets *store.SnippetRepo,
	sessions *store.SessionStateRepo, logs *store.SessionLogRepo, settings *store.SettingsRepo) *LockService {
	return &LockService{secret: sec, servers: servers, snippets: snippets, sessions: sessions, logs: logs, settings: settings}
}

// HasPin reports whether an app-lock PIN has been set.
func (s *LockService) HasPin() bool {
	_, err := s.secret.GetAppLockHash()
	return err == nil
}

// SetPin validates a six-digit PIN and stores its bcrypt hash.
func (s *LockService) SetPin(pin string) error {
	if !pinRe.MatchString(pin) {
		return domain.NewError(domain.CodeValidation, "PIN must be exactly six digits.")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return domain.NewError(domain.CodeInternal, "Could not secure the PIN.")
	}
	return s.secret.SetAppLockHash(string(hash))
}

// VerifyPin reports whether pin matches the stored hash. A false with a nil
// error means "wrong PIN"; a non-nil error means the Keychain read failed.
func (s *LockService) VerifyPin(pin string) (bool, error) {
	hash, err := s.secret.GetAppLockHash()
	if err != nil {
		if errors.Is(err, secret.ErrNotStored) {
			return false, nil
		}
		return false, err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(pin)) != nil {
		return false, nil
	}
	return true, nil
}

// ChangePin verifies the current PIN, then sets a new one.
func (s *LockService) ChangePin(oldPin, newPin string) error {
	ok, err := s.VerifyPin(oldPin)
	if err != nil {
		return err
	}
	if !ok {
		return domain.NewError(domain.CodeValidation, "Current PIN is incorrect.")
	}
	return s.SetPin(newPin)
}

// RemovePin verifies the current PIN, then deletes it (disables the lock's
// ability to engage until a new PIN is set).
func (s *LockService) RemovePin(current string) error {
	ok, err := s.VerifyPin(current)
	if err != nil {
		return err
	}
	if !ok {
		return domain.NewError(domain.CodeValidation, "Current PIN is incorrect.")
	}
	return s.secret.DeleteAppLockHash()
}

// ResetAll is the forgot-PIN escape hatch: it wipes app-owned data and returns
// Zish to a clean first-run state WITHOUT uninstalling the app or touching
// ~/.ssh. Mirrors UninstallService's Keychain-then-data order, but keeps the
// process and DB alive. Honest by design: bypassing the lock costs your data.
//
// Servers are removed with a single bulk DeleteAll rather than a per-id
// Delete loop: the servers.jump_id self-foreign-key is NO ACTION, so deleting
// a jump-host server one row at a time fails while another server still
// references it. A bulk DELETE removes every row in one statement, so the
// constraint is satisfied at statement end once nothing references anything.
func (s *LockService) ResetAll() error {
	// Keychain first, while the server list is still readable.
	if list, err := s.servers.List(); err == nil {
		for _, srv := range list {
			_ = s.secret.Delete(srv.ID)
		}
	}
	_ = s.secret.DeleteAppLockHash()
	_ = s.servers.DeleteAll() // bulk: clears jump hosts too; cascades port-forwards
	_ = s.snippets.DeleteAll()
	_ = s.logs.DeleteAll()
	_ = s.sessions.SaveOpenTabs(nil)
	def := domain.DefaultSettings()
	return s.settings.Save(&def)
}
