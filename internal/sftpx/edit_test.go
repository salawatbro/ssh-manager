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

func TestCreateFileIsExclusive(t *testing.T) {
	s, root := newTestSession(t)
	p := filepath.Join(root, "notes.md")
	if err := s.CreateFile(p); err != nil {
		t.Fatalf("CreateFile error = %v", err)
	}
	if fi, err := os.Stat(p); err != nil || fi.Size() != 0 {
		t.Fatalf("CreateFile did not make an empty file: %v", err)
	}
	// A second create over the same name must fail, not clobber.
	if err := s.CreateFile(p); err == nil {
		t.Fatal("CreateFile over an existing file returned nil error")
	}
}

func TestLocalMutations(t *testing.T) {
	root := t.TempDir()

	dir := filepath.Join(root, "releases")
	if err := MkdirLocal(dir); err != nil {
		t.Fatalf("MkdirLocal error = %v", err)
	}
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("MkdirLocal did not create a dir: %v", err)
	}

	f := filepath.Join(root, "a.txt")
	if err := CreateLocalFile(f); err != nil {
		t.Fatalf("CreateLocalFile error = %v", err)
	}
	if err := CreateLocalFile(f); err == nil {
		t.Fatal("CreateLocalFile over an existing file returned nil error")
	}

	renamed := filepath.Join(root, "b.txt")
	if err := RenameLocal(f, renamed); err != nil {
		t.Fatalf("RenameLocal error = %v", err)
	}
	// Renaming onto an existing name must refuse rather than overwrite.
	other := filepath.Join(root, "c.txt")
	_ = os.WriteFile(other, []byte("keep"), 0o644)
	if err := RenameLocal(renamed, other); err == nil {
		t.Fatal("RenameLocal over an existing target returned nil error")
	}

	if err := RemoveLocal(dir); err != nil {
		t.Fatalf("RemoveLocal error = %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("RemoveLocal left the dir behind: %v", err)
	}
}

// RemoveLocal must delete a symlink itself, never descend into and wipe its
// target — the local mirror of the remote Remove's symlink guard.
func TestRemoveLocalDoesNotFollowSymlinks(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(root, "outside")
	_ = os.MkdirAll(outside, 0o755)
	keep := filepath.Join(outside, "keepme.txt")
	_ = os.WriteFile(keep, []byte("do not delete"), 0o644)

	tree := filepath.Join(root, "tree")
	_ = os.MkdirAll(tree, 0o755)
	if err := os.Symlink(outside, filepath.Join(tree, "link")); err != nil {
		t.Fatalf("Symlink error = %v", err)
	}
	if err := RemoveLocal(tree); err != nil {
		t.Fatalf("RemoveLocal error = %v", err)
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatalf("outside file was deleted (symlink followed): %v", err)
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
