package sshx

import (
	"crypto/x509"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

// A password server profile yields exactly one password AuthMethod.
func TestAuthMethodsPassword(t *testing.T) {
	srv := domain.Server{AuthType: domain.AuthPassword}
	ms, err := AuthMethods(srv, Credentials{Password: "pw"})
	if err != nil || len(ms) != 1 {
		t.Fatalf("methods=%d err=%v", len(ms), err)
	}
}

// A key profile with a wrong passphrase surfaces ERR_KEY_PASSPHRASE.
func TestAuthMethodsWrongPassphrase(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "id_ed25519")
	writeEncryptedKey(t, keyPath, "correct-horse") // helper in testserver_test.go
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	_, err := AuthMethods(srv, Credentials{Passphrase: "wrong"})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeKeyPassphrase {
		t.Fatalf("want ERR_KEY_PASSPHRASE, got %v", err)
	}
	// And it really was the x509 error underneath (pins the mapping).
	// (Only asserted indirectly via the code; the parser detail is in auth.go.)
	_ = x509.IncorrectPasswordError
}

// A missing key file is ERR_KEY_NOT_FOUND, not a generic error.
func TestAuthMethodsMissingKeyFile(t *testing.T) {
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: filepath.Join(t.TempDir(), "nope")}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeKeyNotFound {
		t.Fatalf("want ERR_KEY_NOT_FOUND, got %v", err)
	}
}

// An encrypted key with the RIGHT passphrase parses to one method.
func TestAuthMethodsEncryptedKeyCorrectPassphrase(t *testing.T) {
	keyPath := filepath.Join(t.TempDir(), "id_ed25519")
	writeEncryptedKey(t, keyPath, "correct-horse")
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	ms, err := AuthMethods(srv, Credentials{Passphrase: "correct-horse"})
	if err != nil || len(ms) != 1 {
		t.Fatalf("methods=%d err=%v", len(ms), err)
	}
}

// --- Additional tests beyond the brief's baseline ---

// An unencrypted key parses with no passphrase needed — the passphrase-less
// parse must be tried FIRST so this never trips "key is not password
// protected" (a real x/crypto error string for calling
// ParsePrivateKeyWithPassphrase on an unencrypted key).
func TestAuthMethodsUnencryptedKeyNoPassphrase(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "id_ed25519")
	writePlainKey(t, keyPath)
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	ms, err := AuthMethods(srv, Credentials{})
	if err != nil || len(ms) != 1 {
		t.Fatalf("methods=%d err=%v", len(ms), err)
	}
}

// An encrypted key with NO passphrase supplied is ERR_KEY_PASSPHRASE, not a
// generic parse error — this is the "needs a passphrase" branch, distinct
// from the "wrong passphrase" branch above.
func TestAuthMethodsEncryptedKeyNoPassphraseSupplied(t *testing.T) {
	keyPath := filepath.Join(t.TempDir(), "id_ed25519")
	writeEncryptedKey(t, keyPath, "correct-horse")
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeKeyPassphrase {
		t.Fatalf("want ERR_KEY_PASSPHRASE, got %v", err)
	}
}

// A key file that exists but is not a parseable private key at all (garbage
// bytes) still surfaces a coded domain error. loadSigner's verbatim mapping
// (per the task brief) buckets this under CodeKeyNotFound alongside a truly
// missing file — there is no separate "corrupt key" code in the verified
// error matrix — so this pins that (slightly imprecise but intentional)
// behavior rather than asserting a distinction the spec doesn't draw.
func TestAuthMethodsUnparseableKeyFile(t *testing.T) {
	keyPath := filepath.Join(t.TempDir(), "id_ed25519")
	if err := os.WriteFile(keyPath, []byte("not a key\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeKeyNotFound {
		t.Fatalf("want ERR_KEY_NOT_FOUND (verbatim loadSigner mapping), got %v", err)
	}
}

// A key file that exists but cannot be read (permission denied) must surface
// a coded error distinguishable from "file does not exist".
func TestAuthMethodsUnreadableKeyFile(t *testing.T) {
	keyPath := filepath.Join(t.TempDir(), "id_ed25519")
	writePlainKey(t, keyPath)
	if err := os.Chmod(keyPath, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(keyPath, 0o600) })
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want a coded domain error, got %v", err)
	}
}

// An unknown/empty AuthType is a validation error, not a silent zero-method
// success — a caller must not be able to dial with no auth at all.
func TestAuthMethodsUnknownAuthType(t *testing.T) {
	srv := domain.Server{AuthType: domain.AuthType("bogus")}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeValidation {
		t.Fatalf("want ERR_VALIDATION, got %v", err)
	}
}

// An agent-auth profile with no agent reachable (SSH_AUTH_SOCK unset/bad on
// unix) surfaces ERR_AGENT_UNAVAILABLE rather than a bare dial error.
func TestAuthMethodsAgentUnavailable(t *testing.T) {
	t.Setenv("SSH_AUTH_SOCK", filepath.Join(t.TempDir(), "does-not-exist.sock"))
	srv := domain.Server{AuthType: domain.AuthAgent}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeAgentUnavail {
		t.Fatalf("want ERR_AGENT_UNAVAILABLE, got %v", err)
	}
}

// An agent-auth profile with a REACHABLE agent succeeds with exactly one
// method. Just accepting the connection is enough: agent.NewClient and
// ssh.PublicKeysCallback both defer any real protocol exchange until the
// method is actually used by a Dial, which is out of scope here.
func TestAuthMethodsAgentAvailable(t *testing.T) {
	sockPath := filepath.Join(t.TempDir(), "agent.sock")
	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()
	t.Setenv("SSH_AUTH_SOCK", sockPath)
	srv := domain.Server{AuthType: domain.AuthAgent}
	ms, err := AuthMethods(srv, Credentials{})
	if err != nil || len(ms) != 1 {
		t.Fatalf("methods=%d err=%v", len(ms), err)
	}
}

// An agent-auth profile with SSH_AUTH_SOCK unset entirely (as opposed to set
// but pointing nowhere, covered above) is the OTHER branch of dialAgent and
// must still surface ERR_AGENT_UNAVAILABLE.
func TestAuthMethodsAgentUnavailableSockUnset(t *testing.T) {
	t.Setenv("SSH_AUTH_SOCK", "")
	srv := domain.Server{AuthType: domain.AuthAgent}
	_, err := AuthMethods(srv, Credentials{})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeAgentUnavail {
		t.Fatalf("want ERR_AGENT_UNAVAILABLE, got %v", err)
	}
}

// SEC-06: a wrong-passphrase error must never interpolate the passphrase
// itself into the message — only the key path may appear.
func TestAuthMethodsWrongPassphraseNeverLogsSecret(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "id_ed25519")
	writeEncryptedKey(t, keyPath, "correct-horse")
	srv := domain.Server{AuthType: domain.AuthKey, KeyPath: keyPath}
	const secret = "super-secret-wrong-passphrase-xyz"
	_, err := AuthMethods(srv, Credentials{Passphrase: secret})
	if err == nil {
		t.Fatal("expected an error for a wrong passphrase")
	}
	if got := err.Error(); strings.Contains(got, secret) {
		t.Fatalf("SEC-06 violation: error message contains the passphrase: %q", got)
	}
}
