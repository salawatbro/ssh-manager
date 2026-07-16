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
