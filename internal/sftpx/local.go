package sftpx

import (
	"fmt"
	"os"
)

// ListLocal returns dir's entries on the local filesystem.
func ListLocal(dir string) ([]FileEntry, error) {
	des, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("cannot list local %s: %w", dir, err)
	}
	out := make([]FileEntry, 0, len(des))
	for _, de := range des {
		fi, err := de.Info()
		if err != nil {
			continue // a racing unlink between ReadDir and Info; skip it
		}
		out = append(out, FileEntry{
			Name: fi.Name(), IsDir: fi.IsDir(), Size: fi.Size(),
			Mode: fi.Mode().String(), ModTime: fi.ModTime(),
		})
	}
	return out, nil
}

// LocalHome is the local starting directory for the left pane.
func LocalHome() (string, error) {
	h, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot resolve the home directory: %w", err)
	}
	return h, nil
}

// The four below mirror the remote Session's mutations for the local pane, so
// the left side is a full file manager and not read-only. Every path is one the
// user chose in the pane on their own machine.

// MkdirLocal creates a single local directory.
func MkdirLocal(path string) error {
	if err := os.Mkdir(path, 0o750); err != nil {
		return fmt.Errorf("cannot create %s: %w", path, err)
	}
	return nil
}

// RenameLocal renames a local path, refusing to overwrite an existing target —
// the rename prompt is not an overwrite flow, and os.Rename would clobber.
func RenameLocal(oldPath, newPath string) error {
	if _, err := os.Lstat(newPath); err == nil {
		return fmt.Errorf("%s already exists", newPath)
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("cannot rename %s: %w", oldPath, err)
	}
	return nil
}

// RemoveLocal deletes a local file, or a directory and everything under it.
// os.RemoveAll removes a symlink itself rather than following it, so a link
// inside the tree cannot lead the delete outside the confirmed path (the same
// property the remote Remove takes care to keep).
func RemoveLocal(path string) error {
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("cannot remove %s: %w", path, err)
	}
	return nil
}

// CreateLocalFile creates a new empty local file, failing if one already exists.
func CreateLocalFile(path string) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644) //nolint:gosec // G304: editor/pane creates a user-named local file
	if err != nil {
		return fmt.Errorf("cannot create %s: %w", path, err)
	}
	return f.Close()
}
