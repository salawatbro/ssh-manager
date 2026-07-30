// Package secret stores SSH passwords and key passphrases in the OS
// keychain (macOS Keychain, Windows Credential Manager). Secrets never
// touch the SQLite database (SEC-01) and never appear in logs, errors or
// events (SEC-06).
package secret

import (
	"errors"
	"time"

	"github.com/zalando/go-keyring"

	"github.com/salawat/sshmgr/internal/domain"
)

// Service is the keychain service name (TZ 5.6). It is exactly the app's
// bundle identifier in build/config.yml — macOS binds keychain ACLs to it,
// so it must never change once a user has stored their first secret.
const Service = "uz.salawat.sshmgr" //nolint:gosec // G101 false positive: keychain service name (public bundle ID), not a credential

// passphraseSuffix distinguishes a key passphrase from a password for the
// same server (TZ 5.6: account = "{serverID}:passphrase").
const passphraseSuffix = ":passphrase"

// totpSuffix distinguishes a TOTP secret from a password/passphrase for the
// same server (TZ 5.6: account = "{serverID}:totp"). SEC-01: this is the
// ONLY place a TOTP secret is ever stored — never the DB, never JSON export.
const totpSuffix = ":totp"

// appLockAccount is the Keychain account holding the app-lock PIN's bcrypt
// hash (App Lock feature). Server secrets use numeric-ID accounts (optionally
// with a :passphrase / :totp suffix), so this reserved word cannot collide.
const appLockAccount = "app-lock"

// maxSecretBytes caps a stored secret. macOS allows ~2982 bytes for our
// service/account lengths; Windows Credential Manager caps the blob at
// 2560. Use the smaller so a secret that saves on macOS also saves on
// Windows. The pre-check also avoids a zalando bug that leaks a
// /usr/bin/security child process when its own 4096-byte guard trips.
const maxSecretBytes = 2560

// getTimeout bounds a single keychain read. A locked macOS keychain makes
// /usr/bin/security block on a GUI unlock prompt forever, and the library
// takes no context. On timeout we surface ERR_KEYCHAIN rather than hang the
// caller (which, via a bound method, would freeze a modal).
const getTimeout = 8 * time.Second

// ErrNotStored is returned by a Get when no secret is stored for that
// server. It is distinct from a keychain fault so callers can tell "no
// password set" (prompt the user) from "keychain broken" (ERR_KEYCHAIN).
var ErrNotStored = domain.NewError(domain.CodeNotFound, "No secret stored for this server.")

// Store reads and writes a server's secrets.
type Store interface {
	SetPassword(serverID, password string) error
	GetPassword(serverID string) (string, error)
	SetPassphrase(serverID, passphrase string) error
	GetPassphrase(serverID string) (string, error)
	SetTOTPSecret(serverID, secret string) error
	GetTOTPSecret(serverID string) (string, error)
	Delete(serverID string) error
	SetAppLockHash(hash string) error
	GetAppLockHash() (string, error)
	DeleteAppLockHash() error
}

func checkSize(secret string) error {
	if len(secret) > maxSecretBytes {
		return domain.NewError(domain.CodeValidation, "Secret is too long to store in the keychain.")
	}
	return nil
}

// keyringStore is the production Store over zalando/go-keyring.
type keyringStore struct{}

// NewKeyring returns the OS-backed Store.
func NewKeyring() Store { return keyringStore{} }

func (keyringStore) SetPassword(serverID, password string) error {
	if err := checkSize(password); err != nil {
		return err
	}
	return mapSetErr(keyring.Set(Service, serverID, password))
}

func (keyringStore) SetPassphrase(serverID, passphrase string) error {
	if err := checkSize(passphrase); err != nil {
		return err
	}
	return mapSetErr(keyring.Set(Service, serverID+passphraseSuffix, passphrase))
}

func (keyringStore) SetTOTPSecret(serverID, secret string) error {
	if err := checkSize(secret); err != nil {
		return err
	}
	return mapSetErr(keyring.Set(Service, serverID+totpSuffix, secret))
}

func (keyringStore) GetPassword(serverID string) (string, error) {
	return getWithTimeout(serverID)
}

func (keyringStore) GetPassphrase(serverID string) (string, error) {
	return getWithTimeout(serverID + passphraseSuffix)
}

func (keyringStore) GetTOTPSecret(serverID string) (string, error) {
	return getWithTimeout(serverID + totpSuffix)
}

// Delete removes the password, the passphrase and the TOTP secret
// (FR-03.4). A missing entry is not an error — deleting a server that only
// had a password must not fail on the absent passphrase or TOTP secret.
func (keyringStore) Delete(serverID string) error {
	if err := deleteIfPresent(serverID); err != nil {
		return err
	}
	if err := deleteIfPresent(serverID + passphraseSuffix); err != nil {
		return err
	}
	return deleteIfPresent(serverID + totpSuffix)
}

// SetAppLockHash stores the app-lock PIN's bcrypt hash. SEC-01: the PIN never
// reaches the DB — only this hash, only in the Keychain.
func (keyringStore) SetAppLockHash(hash string) error {
	return mapSetErr(keyring.Set(Service, appLockAccount, hash))
}

// GetAppLockHash returns the stored app-lock hash, or ErrNotStored when no PIN
// has been set.
func (keyringStore) GetAppLockHash() (string, error) {
	return getWithTimeout(appLockAccount)
}

// DeleteAppLockHash removes the app-lock hash (PIN removed / factory reset).
func (keyringStore) DeleteAppLockHash() error {
	return deleteIfPresent(appLockAccount)
}

func deleteIfPresent(account string) error {
	err := keyring.Delete(Service, account)
	if err == nil || errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return domain.NewError(domain.CodeKeychain, "Cannot update the Keychain. Check app permissions.")
}

func mapSetErr(err error) error {
	if err == nil {
		return nil
	}
	return domain.NewError(domain.CodeKeychain, "Cannot save to the Keychain. Check app permissions.")
}

// getWithTimeout runs keyring.Get in a goroutine and bounds it, so a locked
// keychain surfaces as ERR_KEYCHAIN instead of hanging.
func getWithTimeout(account string) (string, error) {
	type result struct {
		val string
		err error
	}
	ch := make(chan result, 1)
	go func() {
		v, err := keyring.Get(Service, account)
		ch <- result{v, err}
	}()
	select {
	case r := <-ch:
		if r.err == nil {
			return r.val, nil
		}
		if errors.Is(r.err, keyring.ErrNotFound) {
			return "", ErrNotStored
		}
		// Cannot distinguish "user denied" from "keychain broken" on the
		// exec path — both are the ERR_KEYCHAIN bucket.
		return "", domain.NewError(domain.CodeKeychain, "Cannot read password from Keychain. Check app permissions.")
	case <-time.After(getTimeout):
		return "", domain.NewError(domain.CodeKeychain, "Cannot read password from Keychain. Check app permissions.")
	}
}
