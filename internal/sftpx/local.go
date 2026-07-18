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
