package service

import (
	"errors"
	"regexp"

	"golang.org/x/crypto/bcrypt"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
)

// pinRe is the app-lock PIN format: exactly six digits.
var pinRe = regexp.MustCompile(`^[0-9]{6}$`)

// LockService owns the app-lock PIN. The PIN is stored only as a bcrypt hash
// in the Keychain (via secret.Store) — never in the DB, never in an event or
// log. It is the layer the frontend calls to set, verify, change and remove
// the PIN, and (Task 4) to factory-reset the app when the PIN is forgotten.
type LockService struct {
	secret secret.Store
	// reset dependencies are wired in Task 4.
}

// NewLockService constructs the service. Task 4 adds the repos ResetAll needs.
func NewLockService(sec secret.Store) *LockService {
	return &LockService{secret: sec}
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
