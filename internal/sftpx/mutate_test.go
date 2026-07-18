package sftpx

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMkdirAndRename(t *testing.T) {
	s, root := newTestSession(t)
	dir := filepath.Join(root, "new")
	if err := s.Mkdir(dir); err != nil {
		t.Fatalf("Mkdir error = %v", err)
	}
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Fatalf("Mkdir did not create a dir: %v", err)
	}
	if err := s.Rename(dir, filepath.Join(root, "renamed")); err != nil {
		t.Fatalf("Rename error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "renamed")); err != nil {
		t.Fatalf("renamed dir missing: %v", err)
	}
}

func TestRemoveFileAndRecursiveDir(t *testing.T) {
	s, root := newTestSession(t)
	// A nested tree: root/tree/{a.txt, sub/b.txt}
	tree := filepath.Join(root, "tree")
	_ = os.MkdirAll(filepath.Join(tree, "sub"), 0o755)
	_ = os.WriteFile(filepath.Join(tree, "a.txt"), []byte("x"), 0o644)
	_ = os.WriteFile(filepath.Join(tree, "sub", "b.txt"), []byte("y"), 0o644)

	// Remove a single file.
	if err := s.Remove(filepath.Join(tree, "a.txt")); err != nil {
		t.Fatalf("Remove file error = %v", err)
	}
	// Remove the whole tree recursively.
	if err := s.Remove(tree); err != nil {
		t.Fatalf("Remove recursive error = %v", err)
	}
	if _, err := os.Stat(tree); !os.IsNotExist(err) {
		t.Fatalf("tree still exists after recursive Remove: %v", err)
	}
}
