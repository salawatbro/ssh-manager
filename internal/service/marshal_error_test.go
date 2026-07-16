package service

import (
	"errors"
	"fmt"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestMarshalErrorRecoversCodeThroughWrapChains(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"bare", domain.NewError(domain.CodeHostKeyChanged, "Host key changed."),
			`{"code":"ERR_HOSTKEY_CHANGED","message":"Host key changed."}`},
		{"wrapped once", fmt.Errorf("ctx: %w", domain.NewError(domain.CodeKeychain, "Keychain denied.")),
			`{"code":"ERR_KEYCHAIN","message":"Keychain denied."}`},
		{"wrapped twice", fmt.Errorf("a: %w", fmt.Errorf("b: %w", domain.NewError(domain.CodeAuthFailed, "Auth failed."))),
			`{"code":"ERR_AUTH_FAILED","message":"Auth failed."}`},
		{"joined", errors.Join(errors.New("noise"), domain.NewError(domain.CodeDNS, "Cannot resolve host.")),
			`{"code":"ERR_DNS","message":"Cannot resolve host."}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := string(MarshalError(tc.err)); got != tc.want {
				t.Fatalf("MarshalError = %s, want %s", got, tc.want)
			}
		})
	}
}

// A non-domain error must return nil so Wails falls back to its default
// marshaller. Returning JSON here would swallow errors we didn't code.
func TestMarshalErrorReturnsNilForNonDomainError(t *testing.T) {
	if MarshalError(fmt.Errorf("disk on fire")) != nil {
		t.Fatal("expected nil for a non-domain error")
	}
}
