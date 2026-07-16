package domain

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
)

func TestNewErrorCarriesCodeAndMessage(t *testing.T) {
	e := NewError(CodeHostKeyChanged, "Host key changed.")
	if e.Code != "ERR_HOSTKEY_CHANGED" || e.Message != "Host key changed." {
		t.Fatalf("got %+v", e)
	}
	if e.Error() != "Host key changed." {
		t.Fatalf("Error() = %q", e.Error())
	}
}

// The code must survive JSON marshalling — the frontend switches on it.
func TestErrorMarshalsWithCode(t *testing.T) {
	b, err := json.Marshal(NewError(CodeKeychain, "Cannot read password from Keychain. Check app permissions."))
	if err != nil {
		t.Fatal(err)
	}
	if got := string(b); got != `{"code":"ERR_KEYCHAIN","message":"Cannot read password from Keychain. Check app permissions."}` {
		t.Fatalf("marshalled = %s", got)
	}
}

// errors.As must reach a *domain.Error through a wrap chain — the whole
// point of the codes is that a wrapped connect error still classifies.
func TestErrorUnwrapsThroughFmtErrorf(t *testing.T) {
	wrapped := fmt.Errorf("dialing failed: %w", NewError(CodeConnRefused, "Connection refused."))
	var de *Error
	if !errors.As(wrapped, &de) || de.Code != CodeConnRefused {
		t.Fatalf("errors.As failed to recover the code: %+v", de)
	}
}
