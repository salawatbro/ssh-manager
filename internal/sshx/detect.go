package sshx

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/ssh"
)

// KeyInfo describes a private key found on disk. It never carries key
// material — only metadata safe to hand to the frontend.
type KeyInfo struct {
	Path      string `json:"path"`
	Type      string `json:"type"` // ed25519, rsa, ecdsa
	Encrypted bool   `json:"encrypted"`
}

// DetectKeys lists likely private keys in ~/.ssh (FR-02.5), marking each
// with its type and whether it is passphrase-encrypted. It never reads a
// passphrase and never returns key material — only metadata.
func DetectKeys() ([]KeyInfo, error) {
	dir, err := sshDir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // no ~/.ssh yet — empty list, not an error
		}
		return nil, err
	}
	var keys []KeyInfo
	for _, e := range entries {
		if e.IsDir() || !looksLikePrivateKey(e.Name()) {
			continue
		}
		path := filepath.Join(dir, e.Name())
		info, ok := inspectKey(path)
		if ok {
			keys = append(keys, info)
		}
	}
	return keys, nil
}

// sshDir returns ~/.ssh. It reads HOME directly (rather than
// os.UserHomeDir, which looks at USERPROFILE on Windows) so tests can
// override the home directory with t.Setenv("HOME", dir); real runs on any
// OS fall back to os.UserHomeDir when HOME is unset.
func sshDir() (string, error) {
	home := os.Getenv("HOME")
	if home == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return "", err
		}
	}
	return filepath.Join(home, ".ssh"), nil
}

// inspectKey parses just enough to learn the type and encrypted flag.
func inspectKey(path string) (KeyInfo, bool) {
	pem, err := os.ReadFile(path) //nolint:gosec // G304: path is an entry enumerated from the user's own ~/.ssh (via sshDir/os.ReadDir just above), not attacker input.
	if err != nil {
		return KeyInfo{}, false
	}
	signer, err := ssh.ParsePrivateKey(pem)
	if err == nil {
		return KeyInfo{Path: path, Type: signer.PublicKey().Type(), Encrypted: false}, true
	}
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) {
		typ := "encrypted"
		if missing.PublicKey != nil { // OpenSSH format exposes the pubkey
			typ = missing.PublicKey.Type()
		}
		return KeyInfo{Path: path, Type: typ, Encrypted: true}, true
	}
	return KeyInfo{}, false // not a parseable private key (e.g. a .pub or config)
}

// looksLikePrivateKey filters out .pub, known_hosts, config, authorized_keys.
func looksLikePrivateKey(name string) bool {
	if strings.HasSuffix(name, ".pub") {
		return false
	}
	switch name {
	case "known_hosts", "known_hosts.old", "config", "authorized_keys", "agent":
		return false
	}
	return true
}
