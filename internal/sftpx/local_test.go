package sftpx

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListLocalReturnsEntries(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "f.txt"), []byte("hi"), 0o644)
	_ = os.Mkdir(filepath.Join(dir, "d"), 0o755)

	entries, err := ListLocal(dir)
	if err != nil {
		t.Fatalf("ListLocal error = %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("len = %d, want 2", len(entries))
	}
}

func TestLocalHome(t *testing.T) {
	home, err := LocalHome()
	if err != nil || home == "" {
		t.Fatalf("LocalHome = %q, %v; want a path", home, err)
	}
}
