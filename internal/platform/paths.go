// Package platform resolves OS-specific file locations for the app.
package platform

import (
	"fmt"
	"os"
	"path/filepath"
)

// appFolder is the per-user folder name inside the OS config directory.
//
//	macOS:   ~/Library/Application Support/SSHManager
//	Windows: %APPDATA%\SSHManager
const appFolder = "SSHManager"

// DataDir reports where the database and logs live. It does not touch disk —
// callers that need the folder to exist must call EnsureDataDir.
func DataDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf(
			"cannot resolve the OS config directory, so the database location is unknown; "+
				"check that HOME (macOS) or APPDATA (Windows) is set: %w", err)
	}
	return filepath.Join(base, appFolder), nil
}

// EnsureDataDir creates the data folder if missing and returns its path.
//
// The Chmod is not redundant, and the reason is not umask. MkdirAll can never
// produce a mode looser than the one asked for — umask only clears bits. What
// it does do is nothing at all when the folder already exists: a folder left
// at 0755 by an older build, a restore from backup, or the user's own mkdir
// would keep that mode forever. Chmod is what makes SEC-05 hold on every run
// instead of only on the first one.
func EnsureDataDir() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf(
			"cannot create the data folder %s; check the parent folder exists and is writable: %w", dir, err)
	}
	// nolint:gosec // G302 wants 0600 or less, but it does not distinguish a
	// directory from a file: it only sees os.Chmod. 0600 on a directory strips
	// the execute bit, which is what permits traversal — verified: a folder at
	// drw------- cannot be entered, so reading sshmgr.db inside it fails with
	// "permission denied". SEC-05 mandates drwx------, i.e. exactly 0700.
	// Complying with G302 here would break the app.
	if err := os.Chmod(dir, 0o700); err != nil { //nolint:gosec // see above
		return "", fmt.Errorf(
			"cannot set 0700 on the data folder %s; check that you own it: %w", dir, err)
	}
	return dir, nil
}

// KnownHostsPath reports the OpenSSH known_hosts file (TZ 5.7). It lives in
// the user's ~/.ssh, shared with the system ssh client — not in the app's
// data folder — so the app trusts (and adds to) the same host keys the
// terminal ssh does.
func KnownHostsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot resolve the home directory for known_hosts: %w", err)
	}
	return filepath.Join(home, ".ssh", "known_hosts"), nil
}

// SSHConfigPath reports the user's OpenSSH client config (~/.ssh/config), the
// source for FR-11 import. Shared with the system ssh client, not app-owned.
func SSHConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot resolve the home directory for ssh config: %w", err)
	}
	return filepath.Join(home, ".ssh", "config"), nil
}

// LaunchAgentPath reports the per-user LaunchAgent plist for start-at-login
// (macOS). The label is the app's bundle id (build/config.yml).
func LaunchAgentPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot resolve the home directory for the login item: %w", err)
	}
	return filepath.Join(home, "Library", "LaunchAgents", "uz.salawat.sshmgr.plist"), nil
}

// DBPath reports the SQLite file path.
func DBPath() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "sshmgr.db"), nil
}

// LogDir reports the log folder path.
func LogDir() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "logs"), nil
}
