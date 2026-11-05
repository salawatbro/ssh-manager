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

// Biometrics is Touch ID; package main's BiometricService implements it.
type Biometrics interface {
	Available() bool
	Authenticate(reason string) bool
}

// LockService owns the app-lock PIN. The PIN is stored only as a bcrypt hash
// in the Keychain (via secret.Store) — never in the DB, never in an event or
// log. It is the layer the frontend calls to set, verify, change and remove
// the PIN, to lock and unlock the backend LockGate, and to factory-reset the
// app when the PIN is forgotten.
type LockService struct {
	secret   secret.Store
	servers  *store.ServerRepo
	settings *store.SettingsRepo
	gate     *LockGate
	bio      Biometrics
	agent    *AgentService
}

// SetLockAgent lets ResetAll delete the agent's keys. Package-level so it
// never becomes a frontend binding.
func SetLockAgent(s *LockService, as *AgentService) { s.agent = as }

// NewLockService constructs the service. The repo arguments are only used by
// ResetAll — PIN-only callers may pass nil for both. A nil gate gets a fresh
// unlocked one; a nil bio means no Touch ID.
func NewLockService(sec secret.Store, servers *store.ServerRepo, settings *store.SettingsRepo, gate *LockGate, bio Biometrics) *LockService {
	if gate == nil {
		gate = NewLockGate(false)
	}
	return &LockService{secret: sec, servers: servers, settings: settings, gate: gate, bio: bio}
}

// Lock engages the lock (⌘L, idle timer). Without a PIN there would be no way
// back in, so it does nothing then.
func (s *LockService) Lock() {
	if s.HasPin() {
		s.gate.Lock()
	}
}

// IsLocked reports the backend lock state; the frontend reads it at boot.
func (s *LockService) IsLocked() bool { return s.gate.Locked() }

// UnlockWithBiometrics shows the Touch ID prompt and unlocks on success.
func (s *LockService) UnlockWithBiometrics(reason string) bool {
	if s.bio == nil || !s.bio.Authenticate(reason) {
		return false
	}
	s.gate.Unlock()
	return true
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

// VerifyPin reports whether pin matches the stored hash, and unlocks on a
// match. A false with a nil error means "wrong PIN"; a non-nil error means
// the Keychain read failed.
func (s *LockService) VerifyPin(pin string) (bool, error) {
	ok, err := s.checkPin(pin)
	if ok {
		s.gate.Unlock()
	}
	return ok, err
}

func (s *LockService) checkPin(pin string) (bool, error) {
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
	ok, err := s.checkPin(oldPin)
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
	ok, err := s.checkPin(current)
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
	// Bypassing the lock must not leave agent keys usable.
	s.agent.wipeAll()
	_ = s.servers.DeleteAll() // bulk: clears jump hosts too; cascades port-forwards
	s.gate.Unlock()
	def := domain.DefaultSettings()
	return s.settings.Save(&def)
}
