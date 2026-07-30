package sftpx

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
)

// MaxEditBytes caps what the file editor reads or writes. It mirrors the
// frontend's EDIT_SIZE_LIMIT (lib/fileEditor.ts): the UI refuses to open a
// larger file, and this is the backend enforcing the same ceiling for a caller
// that got past it — a file that grew since it was listed, or a direct binding
// call. 2 MiB is well past any config or source file and comfortable for a
// textarea.
const MaxEditBytes = 2 << 20

// ErrTooLarge and ErrBinary let the service layer turn these two expected
// rejections into typed validation errors while any real IO failure passes
// through as itself. The frontend gates on name and size before opening, so
// hitting either of these means the file changed under it.
var (
	ErrTooLarge = errors.New("file is larger than the edit limit")
	ErrBinary   = errors.New("file is not a text file")
)

// ReadFile returns a remote text file's contents, refusing anything over the
// edit ceiling or containing a NUL byte (the mark of a binary the extension did
// not admit to).
func (s *Session) ReadFile(p string) (string, error) {
	fi, err := s.client.Stat(p)
	if err != nil {
		return "", fmt.Errorf("cannot open %s: %w", p, err)
	}
	if fi.IsDir() {
		return "", fmt.Errorf("%s is a directory, not a file", p)
	}
	if fi.Size() > MaxEditBytes {
		return "", ErrTooLarge
	}
	f, err := s.client.Open(p)
	if err != nil {
		return "", fmt.Errorf("cannot open %s: %w", p, err)
	}
	defer func() { _ = f.Close() }()
	return readCapped(f, p)
}

// WriteFile replaces a remote file's contents atomically: it writes a sibling
// temp file, matches the original's permission bits, and renames it over the
// target — so a connection dropped mid-write leaves the original intact rather
// than a half-written file.
func (s *Session) WriteFile(p, content string) error {
	if len(content) > MaxEditBytes {
		return ErrTooLarge
	}
	mode := os.FileMode(0o644)
	if fi, err := s.client.Stat(p); err == nil {
		mode = fi.Mode().Perm()
	}
	tmp := path.Join(path.Dir(p), tempName(path.Base(p)))
	f, err := s.client.Create(tmp)
	if err != nil {
		return fmt.Errorf("cannot write in %s: %w", path.Dir(p), err)
	}
	if _, err := f.Write([]byte(content)); err != nil {
		_ = f.Close()
		_ = s.client.Remove(tmp)
		return fmt.Errorf("cannot write %s: %w", p, err)
	}
	if err := f.Close(); err != nil {
		_ = s.client.Remove(tmp)
		return fmt.Errorf("cannot finish writing %s: %w", p, err)
	}
	_ = s.client.Chmod(tmp, mode)
	if err := s.replace(tmp, p); err != nil {
		_ = s.client.Remove(tmp)
		return fmt.Errorf("cannot replace %s: %w", p, err)
	}
	return nil
}

// replace renames tmp over p. Plain SFTP rename fails when the target exists;
// posix-rename@openssh.com (PosixRename) overwrites atomically and every
// OpenSSH server offers it. A server without the extension falls back to
// remove-then-rename, which has a brief window where p is gone — the cost of
// atomicity not being available there.
func (s *Session) replace(tmp, p string) error {
	if err := s.client.PosixRename(tmp, p); err == nil {
		return nil
	}
	_ = s.client.Remove(p)
	return s.client.Rename(tmp, p)
}

// ReadLocalFile is ReadFile for the left pane's local filesystem.
func ReadLocalFile(p string) (string, error) {
	fi, err := os.Stat(p)
	if err != nil {
		return "", fmt.Errorf("cannot open %s: %w", p, err)
	}
	if fi.IsDir() {
		return "", fmt.Errorf("%s is a directory, not a file", p)
	}
	if fi.Size() > MaxEditBytes {
		return "", ErrTooLarge
	}
	// The path is user-chosen by design — this is a file editor opening the
	// file the user double-clicked in the local pane. It is confined to the
	// local machine and never derived from remote input.
	f, err := os.Open(p) //nolint:gosec // G304: editor opens a user-selected local file
	if err != nil {
		return "", fmt.Errorf("cannot open %s: %w", p, err)
	}
	defer func() { _ = f.Close() }()
	return readCapped(f, p)
}

// WriteLocalFile is WriteFile for the local filesystem; os.Rename is an atomic
// overwrite on this app's macOS target.
func WriteLocalFile(p, content string) error {
	if len(content) > MaxEditBytes {
		return ErrTooLarge
	}
	mode := os.FileMode(0o644)
	if fi, err := os.Stat(p); err == nil {
		mode = fi.Mode().Perm()
	}
	dir := filepath.Dir(p)
	f, err := os.CreateTemp(dir, "."+filepath.Base(p)+".zish-*")
	if err != nil {
		return fmt.Errorf("cannot write in %s: %w", dir, err)
	}
	tmp := f.Name()
	if _, err := f.WriteString(content); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return fmt.Errorf("cannot write %s: %w", p, err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("cannot finish writing %s: %w", p, err)
	}
	_ = os.Chmod(tmp, mode)
	if err := os.Rename(tmp, p); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("cannot replace %s: %w", p, err)
	}
	return nil
}

// readCapped reads up to one byte past the ceiling — so a file that grew
// between Stat and Open is caught rather than silently truncated — and rejects
// a NUL byte as binary.
func readCapped(r io.Reader, p string) (string, error) {
	buf, err := io.ReadAll(io.LimitReader(r, MaxEditBytes+1))
	if err != nil {
		return "", fmt.Errorf("cannot read %s: %w", p, err)
	}
	if len(buf) > MaxEditBytes {
		return "", ErrTooLarge
	}
	if bytes.IndexByte(buf, 0) >= 0 {
		return "", ErrBinary
	}
	return string(buf), nil
}

// tempName is a hidden sibling of base with random bytes, so two saves of the
// same file cannot collide on the temp path.
func tempName(base string) string {
	var b [6]byte
	_, _ = rand.Read(b[:])
	return "." + base + ".zish-" + hex.EncodeToString(b[:])
}
