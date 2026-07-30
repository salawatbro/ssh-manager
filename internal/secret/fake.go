package secret

// Fake is an in-memory Store for tests. It is deliberately NOT the zalando
// library's keyring.MockInit(): that swaps a package-level global and races
// under -race across t.Parallel() tests (verified). A per-instance struct
// has no shared state, so every test gets its own isolated keychain.
type Fake struct {
	pw      map[string]string
	phrase  map[string]string
	totp    map[string]string
	fail    error
	appLock *string // nil means unset
}

// NewFake returns an empty in-memory Store.
func NewFake() *Fake {
	return &Fake{pw: map[string]string{}, phrase: map[string]string{}, totp: map[string]string{}}
}

// FailWith makes every subsequent operation return err — used to exercise
// the service layer's ERR_KEYCHAIN handling.
func (f *Fake) FailWith(err error) { f.fail = err }

// SetPassword stores serverID's password in the fake.
func (f *Fake) SetPassword(serverID, password string) error {
	if f.fail != nil {
		return f.fail
	}
	if err := checkSize(password); err != nil {
		return err
	}
	f.pw[serverID] = password
	return nil
}

// GetPassword returns serverID's stored password, or ErrNotStored.
func (f *Fake) GetPassword(serverID string) (string, error) {
	if f.fail != nil {
		return "", f.fail
	}
	v, ok := f.pw[serverID]
	if !ok {
		return "", ErrNotStored
	}
	return v, nil
}

// SetPassphrase stores serverID's key passphrase in the fake.
func (f *Fake) SetPassphrase(serverID, passphrase string) error {
	if f.fail != nil {
		return f.fail
	}
	if err := checkSize(passphrase); err != nil {
		return err
	}
	f.phrase[serverID] = passphrase
	return nil
}

// GetPassphrase returns serverID's stored key passphrase, or ErrNotStored.
func (f *Fake) GetPassphrase(serverID string) (string, error) {
	if f.fail != nil {
		return "", f.fail
	}
	v, ok := f.phrase[serverID]
	if !ok {
		return "", ErrNotStored
	}
	return v, nil
}

// SetTOTPSecret stores serverID's TOTP secret in the fake.
func (f *Fake) SetTOTPSecret(serverID, secret string) error {
	if f.fail != nil {
		return f.fail
	}
	if err := checkSize(secret); err != nil {
		return err
	}
	f.totp[serverID] = secret
	return nil
}

// GetTOTPSecret returns serverID's stored TOTP secret, or ErrNotStored.
func (f *Fake) GetTOTPSecret(serverID string) (string, error) {
	if f.fail != nil {
		return "", f.fail
	}
	v, ok := f.totp[serverID]
	if !ok {
		return "", ErrNotStored
	}
	return v, nil
}

// Delete removes serverID's password, passphrase and TOTP secret.
func (f *Fake) Delete(serverID string) error {
	if f.fail != nil {
		return f.fail
	}
	delete(f.pw, serverID)
	delete(f.phrase, serverID)
	delete(f.totp, serverID)
	return nil
}

// SetAppLockHash stores the app-lock hash in the fake.
func (f *Fake) SetAppLockHash(hash string) error {
	if f.fail != nil {
		return f.fail
	}
	f.appLock = &hash
	return nil
}

// GetAppLockHash returns the stored app-lock hash, or ErrNotStored.
func (f *Fake) GetAppLockHash() (string, error) {
	if f.fail != nil {
		return "", f.fail
	}
	if f.appLock == nil {
		return "", ErrNotStored
	}
	return *f.appLock, nil
}

// DeleteAppLockHash clears the fake's app-lock hash.
func (f *Fake) DeleteAppLockHash() error {
	if f.fail != nil {
		return f.fail
	}
	f.appLock = nil
	return nil
}
