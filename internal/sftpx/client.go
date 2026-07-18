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
