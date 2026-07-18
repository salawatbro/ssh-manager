// Package sftpx browses and transfers files over SFTP (github.com/pkg/sftp)
// on top of an already-open *ssh.Client, plus the local filesystem. It is
// cgo-free and imports neither internal/store, internal/secret nor
// internal/sshx (R-05) — the caller owns the SSH connection lifecycle.
package sftpx

import "time"

// FileEntry is one directory entry, local or remote. Mode is the 9-char
// permission string (os.FileMode.String()'s tail, e.g. "-rw-r--r--").
type FileEntry struct {
	Name    string    `json:"name"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	Mode    string    `json:"mode"`
	ModTime time.Time `json:"modTime"`
}
