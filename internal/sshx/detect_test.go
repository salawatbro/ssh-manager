package sshx

import (
	"os"
	"path/filepath"
	"testing"
)

// An absent ~/.ssh is not an error — DetectKeys returns an empty/nil list.
func TestDetectKeysNoSSHDir(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	keys, err := DetectKeys()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("want no keys, got %v", keys)
	}
}

// An empty ~/.ssh (dir present, no key files) also yields an empty list.
func TestDetectKeysEmptySSHDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.Mkdir(filepath.Join(home, ".ssh"), 0o700); err != nil {
		t.Fatal(err)
	}
	keys, err := DetectKeys()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("want no keys, got %v", keys)
	}
}

// DetectKeys marks an unencrypted key Encrypted:false with its type, an
// encrypted key Encrypted:true, and skips .pub/known_hosts/config/
// authorized_keys/agent entirely.
func TestDetectKeysMixedDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDirPath := filepath.Join(home, ".ssh")
	if err := os.Mkdir(sshDirPath, 0o700); err != nil {
		t.Fatal(err)
	}

	plainPath := filepath.Join(sshDirPath, "id_ed25519")
	writePlainKey(t, plainPath)
	// A matching .pub alongside the plain key must be skipped.
	if err := os.WriteFile(plainPath+".pub", []byte("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA fake\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	encPath := filepath.Join(sshDirPath, "id_ed25519_enc")
	writeEncryptedKey(t, encPath, "correct-horse")

	// Non-key files that must be skipped outright.
	for name, content := range map[string]string{
		"known_hosts":     "10.0.1.20 ssh-ed25519 AAAA\n",
		"known_hosts.old": "10.0.1.20 ssh-ed25519 AAAA\n",
		"config":          "Host *\n  User test\n",
		"authorized_keys": "ssh-ed25519 AAAA test\n",
		"agent":           "not a key\n",
	} {
		if err := os.WriteFile(filepath.Join(sshDirPath, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	keys, err := DetectKeys()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("want exactly 2 detected keys (plain + encrypted), got %d: %+v", len(keys), keys)
	}

	byPath := map[string]KeyInfo{}
	for _, k := range keys {
		byPath[k.Path] = k
	}

	plain, ok := byPath[plainPath]
	if !ok {
		t.Fatalf("plain key not detected: %+v", keys)
	}
	if plain.Encrypted {
		t.Fatalf("plain key must be Encrypted:false, got %+v", plain)
	}
	if plain.Type != "ssh-ed25519" {
		t.Fatalf("plain key type = %q, want ssh-ed25519", plain.Type)
	}

	enc, ok := byPath[encPath]
	if !ok {
		t.Fatalf("encrypted key not detected: %+v", keys)
	}
	if !enc.Encrypted {
		t.Fatalf("encrypted key must be Encrypted:true, got %+v", enc)
	}
	if enc.Type == "" {
		t.Fatalf("encrypted key must still report a type, got %+v", enc)
	}
}

// A subdirectory inside ~/.ssh (e.g. a "sockets" dir some tools create) must
// be skipped, not treated as a key file.
func TestDetectKeysSkipsSubdirectories(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDirPath := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(filepath.Join(sshDirPath, "sockets"), 0o700); err != nil {
		t.Fatal(err)
	}
	keys, err := DetectKeys()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("want no keys, got %v", keys)
	}
}

// If HOME cannot be resolved at all — unset, and the OS-level
// os.UserHomeDir fallback also fails (true on darwin/linux; skipped where
// it isn't) — DetectKeys must surface a plain error via sshDir rather than
// panic or silently return an empty list.
func TestDetectKeysHomeUnresolvable(t *testing.T) {
	t.Setenv("HOME", "")
	if _, err := os.UserHomeDir(); err == nil {
		t.Skip("this platform resolves a home directory even with HOME unset; nothing to assert")
	}
	if _, err := DetectKeys(); err == nil {
		t.Fatal("want an error when the home directory cannot be resolved at all")
	}
}

// A key file present but unreadable (permission denied) must be skipped
// silently by inspectKey, not treated as a detected key or a fatal error.
func TestDetectKeysSkipsUnreadableFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDirPath := filepath.Join(home, ".ssh")
	if err := os.Mkdir(sshDirPath, 0o700); err != nil {
		t.Fatal(err)
	}
	keyPath := filepath.Join(sshDirPath, "id_ed25519")
	writePlainKey(t, keyPath)
	if err := os.Chmod(keyPath, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(keyPath, 0o600) })

	keys, err := DetectKeys()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("want no keys (unreadable file skipped), got %v", keys)
	}
}

// A ~/.ssh directory that exists but cannot be READ (permission denied) must
// surface a plain error — distinct from the "does not exist" case, which is
// deliberately treated as an empty list rather than an error.
func TestDetectKeysUnreadableSSHDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDirPath := filepath.Join(home, ".ssh")
	if err := os.Mkdir(sshDirPath, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(sshDirPath, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(sshDirPath, 0o700) })

	if _, err := DetectKeys(); err == nil {
		t.Fatal("want an error when ~/.ssh cannot be read")
	}
}

// A garbage file (not a parseable private key, not a .pub, not a recognized
// non-key name) is silently skipped, not reported as a key.
func TestDetectKeysSkipsUnparseableFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	sshDirPath := filepath.Join(home, ".ssh")
	if err := os.Mkdir(sshDirPath, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sshDirPath, "notes.txt"), []byte("just some notes"), 0o600); err != nil {
		t.Fatal(err)
	}
	keys, err := DetectKeys()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("want no keys, got %v", keys)
	}
}
