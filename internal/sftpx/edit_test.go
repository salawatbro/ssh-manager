package sftpx

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadFileReturnsContents(t *testing.T) {
	s, root := newTestSession(t)
	p := filepath.Join(root, "nginx.conf")
	if err := os.WriteFile(p, []byte("server {\n  listen 80;\n}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := s.ReadFile(p)
	if err != nil {
		t.Fatalf("ReadFile error = %v", err)
	}
	if !strings.Contains(got, "listen 80") {
		t.Fatalf("ReadFile got %q", got)
	}
}

func TestReadFileRejectsBinaryAndOversize(t *testing.T) {
	s, root := newTestSession(t)

	bin := filepath.Join(root, "logo.bin")
	if err := os.WriteFile(bin, []byte{0x1, 0x0, 0x2}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadFile(bin); !errors.Is(err, ErrBinary) {
		t.Fatalf("ReadFile(binary) err = %v, want ErrBinary", err)
	}

	big := filepath.Join(root, "big.log")
	if err := os.WriteFile(big, make([]byte, MaxEditBytes+1), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadFile(big); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("ReadFile(oversize) err = %v, want ErrTooLarge", err)
	}
}

// WriteFile must overwrite an existing file (not fail because the target
// exists, as a plain SFTP rename would) and leave the original in place if the
// rename never happens. The in-process pkg/sftp server supports
// posix-rename@openssh.com, so this exercises the atomic path.
func TestWriteFileOverwritesAndPreservesMode(t *testing.T) {
	s, root := newTestSession(t)
	p := filepath.Join(root, "app.conf")
	if err := os.WriteFile(p, []byte("old = 1\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	if err := s.WriteFile(p, "new = 2\n"); err != nil {
		t.Fatalf("WriteFile error = %v", err)
	}
	got, err := os.ReadFile(p)
	if err != nil || string(got) != "new = 2\n" {
		t.Fatalf("after WriteFile: %q, %v", got, err)
	}
	if fi, _ := os.Stat(p); fi.Mode().Perm() != 0o640 {
		t.Fatalf("mode = %v, want 0640 preserved", fi.Mode().Perm())
	}
	// No temp file left behind in the directory.
	entries, _ := os.ReadDir(root)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".zish-") {
			t.Fatalf("temp file left behind: %s", e.Name())
		}
	}
}

func TestWriteFileCreatesNewFile(t *testing.T) {
	s, root := newTestSession(t)
	p := filepath.Join(root, "fresh.txt")
	if err := s.WriteFile(p, "hello\n"); err != nil {
		t.Fatalf("WriteFile error = %v", err)
	}
	got, err := os.ReadFile(p)
	if err != nil || string(got) != "hello\n" {
		t.Fatalf("new file: %q, %v", got, err)
	}
}

func TestWriteFileRejectsOversize(t *testing.T) {
	s, root := newTestSession(t)
	if err := s.WriteFile(filepath.Join(root, "x"), strings.Repeat("a", MaxEditBytes+1)); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("WriteFile(oversize) err = %v, want ErrTooLarge", err)
	}
}

func TestLocalReadWriteRoundTrip(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "notes.md")
	if err := WriteLocalFile(p, "# notes\n"); err != nil {
		t.Fatalf("WriteLocalFile error = %v", err)
	}
	got, err := ReadLocalFile(p)
	if err != nil || got != "# notes\n" {
		t.Fatalf("round trip: %q, %v", got, err)
	}
	// Overwrite preserves the round trip and leaves no temp file.
	if err := WriteLocalFile(p, "# changed\n"); err != nil {
		t.Fatalf("WriteLocalFile overwrite error = %v", err)
	}
	if got, _ := ReadLocalFile(p); got != "# changed\n" {
		t.Fatalf("overwrite got %q", got)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, found %d (temp left behind?)", len(entries))
	}
}

func TestReadLocalFileRejectsBinary(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a.out")
	if err := os.WriteFile(p, []byte("ELF\x00\x01"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadLocalFile(p); !errors.Is(err, ErrBinary) {
		t.Fatalf("ReadLocalFile(binary) err = %v, want ErrBinary", err)
	}
}
