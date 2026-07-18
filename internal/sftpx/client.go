package sftpx

import (
	"fmt"
	"os"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// Session is one open SFTP client over an *ssh.Client. Close it to release the
// SFTP channel; the caller closes the *ssh.Client itself.
type Session struct {
	client *sftp.Client
}

// Open starts an SFTP subsystem over an already-connected *ssh.Client.
func Open(client *ssh.Client) (*Session, error) {
	c, err := sftp.NewClient(client)
	if err != nil {
		return nil, fmt.Errorf("cannot start SFTP on this connection; the server may not offer the sftp subsystem: %w", err)
	}
	return &Session{client: c}, nil
}

// Close ends the SFTP session (not the underlying SSH connection).
func (s *Session) Close() error { return s.client.Close() }

// List returns dir's entries (no "." or ".."; the UI adds parent navigation).
func (s *Session) List(dir string) ([]FileEntry, error) {
	infos, err := s.client.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("cannot list %s: %w", dir, err)
	}
	return toEntries(infos), nil
}

// Home is the initial remote directory (the server's working dir, or "/").
func (s *Session) Home() (string, error) {
	wd, err := s.client.Getwd()
	if err != nil || wd == "" {
		return "/", nil //nolint:nilerr // "/" is a safe, valid fallback root
	}
	return wd, nil
}

// Mkdir creates a single directory.
func (s *Session) Mkdir(path string) error {
	if err := s.client.Mkdir(path); err != nil {
		return fmt.Errorf("cannot create %s: %w", path, err)
	}
	return nil
}

// Rename moves/renames a path.
func (s *Session) Rename(oldPath, newPath string) error {
	if err := s.client.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("cannot rename %s to %s: %w", oldPath, newPath, err)
	}
	return nil
}

// Remove deletes a file, or a directory and everything under it. pkg/sftp has
// no RemoveAll, so directories are walked depth-first: children first, then the
// now-empty directory. A plain file takes the fast path.
func (s *Session) Remove(path string) error {
	fi, err := s.client.Stat(path)
	if err != nil {
		return fmt.Errorf("cannot stat %s: %w", path, err)
	}
	if !fi.IsDir() {
		if err := s.client.Remove(path); err != nil {
			return fmt.Errorf("cannot remove %s: %w", path, err)
		}
		return nil
	}
	infos, err := s.client.ReadDir(path)
	if err != nil {
		return fmt.Errorf("cannot list %s for removal: %w", path, err)
	}
	for _, child := range infos {
		if err := s.Remove(path + "/" + child.Name()); err != nil {
			return err
		}
	}
	if err := s.client.RemoveDirectory(path); err != nil {
		return fmt.Errorf("cannot remove directory %s: %w", path, err)
	}
	return nil
}

func toEntries(infos []os.FileInfo) []FileEntry {
	out := make([]FileEntry, 0, len(infos))
	for _, fi := range infos {
		out = append(out, FileEntry{
			Name:    fi.Name(),
			IsDir:   fi.IsDir(),
			Size:    fi.Size(),
			Mode:    fi.Mode().String(),
			ModTime: fi.ModTime(),
		})
	}
	return out
}
