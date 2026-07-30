package secret

import (
	"errors"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestFakeRoundTripsPasswordAndPassphraseSeparately(t *testing.T) {
	t.Parallel()
	s := NewFake()
	if err := s.SetPassword("srv1", "pw"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetPassphrase("srv1", "phrase"); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetPassword("srv1"); got != "pw" {
		t.Fatalf("password = %q", got)
	}
	if got, _ := s.GetPassphrase("srv1"); got != "phrase" {
		t.Fatalf("passphrase = %q", got)
	}
}

func TestFakeGetMissingReturnsErrNotStored(t *testing.T) {
	t.Parallel()
	s := NewFake()
	_, err := s.GetPassword("nope")
	if !errors.Is(err, ErrNotStored) {
		t.Fatalf("want ErrNotStored, got %v", err)
	}
}

// Delete must clear BOTH secrets (FR-03.4) so a re-created server with the
// same UUID (it won't happen, but the contract is "leave nothing behind")
// cannot read a stale passphrase.
func TestFakeDeleteRemovesBothSecrets(t *testing.T) {
	t.Parallel()
	s := NewFake()
	_ = s.SetPassword("srv1", "pw")
	_ = s.SetPassphrase("srv1", "phrase")
	if err := s.Delete("srv1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetPassword("srv1"); !errors.Is(err, ErrNotStored) {
		t.Fatal("password survived Delete")
	}
	if _, err := s.GetPassphrase("srv1"); !errors.Is(err, ErrNotStored) {
		t.Fatal("passphrase survived Delete")
	}
}

// The fake must reproduce the real store's injectable failure so the
// service layer's ERR_KEYCHAIN path is testable without a real keychain.
func TestFakeCanSimulateKeychainFailure(t *testing.T) {
	t.Parallel()
	s := NewFake()
	s.FailWith(domain.NewError(domain.CodeKeychain, "Cannot read password from Keychain. Check app permissions."))
	if _, err := s.GetPassword("srv1"); err == nil || !strings.Contains(err.Error(), "Keychain") {
		t.Fatalf("want a keychain error, got %v", err)
	}
}

func TestSecretTooBigIsRejected(t *testing.T) {
	t.Parallel()
	s := NewFake()
	if err := s.SetPassword("srv1", strings.Repeat("x", maxSecretBytes+1)); err == nil {
		t.Fatal("oversized secret should be rejected")
	}
}

func TestFakeRoundTripsTOTPSecret(t *testing.T) {
	t.Parallel()
	s := NewFake()
	if err := s.SetTOTPSecret("srv1", "JBSWY3DPEHPK3PXP"); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetTOTPSecret("srv1")
	if err != nil {
		t.Fatal(err)
	}
	if got != "JBSWY3DPEHPK3PXP" {
		t.Fatalf("totp secret = %q", got)
	}
}

func TestFakeGetTOTPMissingReturnsErrNotStored(t *testing.T) {
	t.Parallel()
	s := NewFake()
	if _, err := s.GetTOTPSecret("nope"); !errors.Is(err, ErrNotStored) {
		t.Fatalf("want ErrNotStored, got %v", err)
	}
}

// The password, passphrase and totp secrets for the same server ID must be
// namespaced distinctly (TZ 5.6: ":totp" suffix mirrors ":passphrase") so
// setting all three does not clobber one another.
func TestPasswordPassphraseAndTOTPDoNotCollide(t *testing.T) {
	t.Parallel()
	s := NewFake()
	_ = s.SetPassword("srv1", "pw")
	_ = s.SetPassphrase("srv1", "phrase")
	_ = s.SetTOTPSecret("srv1", "totp-secret")

	if got, _ := s.GetPassword("srv1"); got != "pw" {
		t.Fatalf("password = %q", got)
	}
	if got, _ := s.GetPassphrase("srv1"); got != "phrase" {
		t.Fatalf("passphrase = %q", got)
	}
	if got, _ := s.GetTOTPSecret("srv1"); got != "totp-secret" {
		t.Fatalf("totp secret = %q", got)
	}
}

// Delete must clear the TOTP secret too (SEC-01 lifecycle), on top of the
// password and passphrase already covered by TestFakeDeleteRemovesBothSecrets.
func TestFakeDeleteRemovesTOTPSecret(t *testing.T) {
	t.Parallel()
	s := NewFake()
	_ = s.SetPassword("srv1", "pw")
	_ = s.SetPassphrase("srv1", "phrase")
	_ = s.SetTOTPSecret("srv1", "totp-secret")

	if err := s.Delete("srv1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetPassword("srv1"); !errors.Is(err, ErrNotStored) {
		t.Fatal("password survived Delete")
	}
	if _, err := s.GetPassphrase("srv1"); !errors.Is(err, ErrNotStored) {
		t.Fatal("passphrase survived Delete")
	}
	if _, err := s.GetTOTPSecret("srv1"); !errors.Is(err, ErrNotStored) {
		t.Fatal("totp secret survived Delete")
	}
}

func TestTOTPSecretTooBigIsRejected(t *testing.T) {
	t.Parallel()
	s := NewFake()
	if err := s.SetTOTPSecret("srv1", strings.Repeat("x", maxSecretBytes+1)); err == nil {
		t.Fatal("oversized totp secret should be rejected")
	}
}

func TestFakeAppLockHash(t *testing.T) {
	f := NewFake()

	if _, err := f.GetAppLockHash(); err != ErrNotStored {
		t.Fatalf("GetAppLockHash on empty = %v, want ErrNotStored", err)
	}
	if err := f.SetAppLockHash("hash-abc"); err != nil {
		t.Fatalf("SetAppLockHash: %v", err)
	}
	got, err := f.GetAppLockHash()
	if err != nil || got != "hash-abc" {
		t.Fatalf("GetAppLockHash = %q, %v; want \"hash-abc\", nil", got, err)
	}
	if err := f.DeleteAppLockHash(); err != nil {
		t.Fatalf("DeleteAppLockHash: %v", err)
	}
	if _, err := f.GetAppLockHash(); err != ErrNotStored {
		t.Fatalf("GetAppLockHash after delete = %v, want ErrNotStored", err)
	}
}
