package service

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/salawat/sshmgr/internal/backup"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

var (
	errKeychainRead  = domain.NewError(domain.CodeKeychain, "Cannot read the Keychain, so no backup was made.")
	errKeychainWrite = domain.NewError(domain.CodeKeychain, "Cannot write to the Keychain, so nothing was restored.")
	errNotABackup    = domain.NewError(domain.CodeValidation, "This file is not a Zish backup.")
	errBadPassword   = domain.NewError(domain.CodeValidation, "Wrong password, or the backup is damaged.")
	errNewerBackup   = domain.NewError(domain.CodeValidation, "This backup was made by a newer Zish. Update Zish first.")
	errStillInCloud  = domain.NewError(domain.CodeValidation, "iCloud has not downloaded this backup yet. Try again in a moment.")
)

const sqliteMagic = "SQLite format 3\x00"

// iCloudDownloadWait bounds how long a restore waits for iCloud to fetch a
// backup that was only in the cloud.
var iCloudDownloadWait = 2 * time.Minute

// collect snapshots the database and reads every Keychain item Zish keeps.
// A missing item is fine; a Keychain that cannot be read fails the backup
// rather than produce one without secrets.
func (s *BackupService) collect() (backup.Payload, error) {
	var p backup.Payload
	snap, err := os.CreateTemp(s.dataDir, "backup-snapshot-*.db")
	if err != nil {
		return p, err
	}
	_ = snap.Close()
	defer os.Remove(snap.Name()) //nolint:errcheck // best effort
	if err := BackupDatabase(s.db, snap.Name()); err != nil {
		return p, err
	}
	if p.Database, err = os.ReadFile(snap.Name()); err != nil {
		return p, err
	}

	servers, err := s.servers.List()
	if err != nil {
		return p, err
	}
	p.Servers = map[string]backup.ServerSecrets{}
	for _, srv := range servers {
		var sec backup.ServerSecrets
		for _, get := range []struct {
			read func(string) (string, error)
			into *string
		}{{s.secret.GetPassword, &sec.Password}, {s.secret.GetPassphrase, &sec.Passphrase}, {s.secret.GetTOTPSecret, &sec.TOTP}} {
			v, err := get.read(srv.ID)
			if err != nil && !errors.Is(err, secret.ErrNotStored) {
				return p, errKeychainRead
			}
			*get.into = v
		}
		if sec != (backup.ServerSecrets{}) {
			p.Servers[srv.ID] = sec
		}
	}

	keys, err := s.keys.List()
	if err != nil {
		return p, err
	}
	p.AgentKeys = map[string][]byte{}
	for _, k := range keys {
		der, err := s.secret.GetAgentKey(k.ID)
		if errors.Is(err, secret.ErrNotStored) {
			continue
		}
		if err != nil {
			return p, errKeychainRead
		}
		p.AgentKeys[k.ID] = der
	}

	hash, err := s.secret.GetAppLockHash()
	if err != nil && !errors.Is(err, secret.ErrNotStored) {
		return p, errKeychainRead
	}
	p.AppLockHash = hash
	return p, nil
}

func wipePayload(p *backup.Payload) {
	clear(p.Database)
	for _, der := range p.AgentKeys {
		clear(der)
	}
}

// Restore replaces everything in Zish with the backup at path: the Keychain
// items now, the database at the next start, which it then asks for. Backups
// carry on from this Mac with the same password.
func (s *BackupService) Restore(path, password string) error {
	if s.gate.Locked() {
		return errBackupLocked
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	root, _ := s.root()
	entry, err := s.entryAt(root, path)
	if err != nil {
		return err
	}
	b, err := s.readBackup(entry)
	if err != nil {
		return err
	}
	_, p, err := backup.Open(b, password)
	switch {
	case errors.Is(err, backup.ErrWrongPassword):
		return errBadPassword
	case errors.Is(err, backup.ErrNewerFormat):
		return errNewerBackup
	case err != nil:
		return errNotABackup
	}
	defer wipePayload(&p)
	if !bytes.HasPrefix(p.Database, []byte(sqliteMagic)) {
		return errNotABackup
	}

	pending := store.PendingRestorePath(s.dbPath)
	if err := os.WriteFile(pending, p.Database, 0o600); err != nil {
		return fmt.Errorf("cannot stage the restored database: %w", err)
	}
	if err := s.restoreSecrets(p, password); err != nil {
		_ = os.Remove(pending)
		return err
	}
	if s.restart != nil {
		s.restart()
	}
	return nil
}

// entryAt finds path among the backups under root, so a restore only ever
// reads a file the list offered.
func (s *BackupService) entryAt(root, path string) (backup.Entry, error) {
	entries, err := backup.List(root)
	if err != nil {
		return backup.Entry{}, err
	}
	clean := filepath.Clean(path)
	for _, e := range entries {
		if filepath.Clean(e.Path) == clean || filepath.Clean(e.RealPath()) == clean {
			return e, nil
		}
	}
	return backup.Entry{}, domain.NewError(domain.CodeNotFound, "That backup is no longer there.")
}

func (s *BackupService) readBackup(e backup.Entry) ([]byte, error) {
	path := e.RealPath()
	if e.InCloud {
		if err := downloadFromICloud(path); err != nil {
			return nil, err
		}
	}
	f, err := os.Open(path) //nolint:gosec // a path from the backup list
	if err != nil {
		return nil, errNotABackup
	}
	defer f.Close() //nolint:errcheck // read-only
	b, err := io.ReadAll(io.LimitReader(f, backup.MaxFileSize+1))
	if err != nil || len(b) > backup.MaxFileSize {
		return nil, errNotABackup
	}
	return b, nil
}

// downloadFromICloud asks iCloud for a file it only keeps in the cloud and
// waits for it to arrive.
func downloadFromICloud(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	_ = exec.Command("/usr/bin/brctl", "download", path).Run() //nolint:gosec // fixed tool, the path is an argument
	deadline := time.Now().Add(iCloudDownloadWait)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return nil
		}
		time.Sleep(time.Second)
	}
	return errStillInCloud
}

// restoreSecrets makes the Keychain match the backup: its items written,
// every item of a server or key the backup does not have removed.
func (s *BackupService) restoreSecrets(p backup.Payload, password string) error {
	for id, sec := range p.Servers {
		for _, set := range []struct {
			write func(string, string) error
			val   string
		}{{s.secret.SetPassword, sec.Password}, {s.secret.SetPassphrase, sec.Passphrase}, {s.secret.SetTOTPSecret, sec.TOTP}} {
			if set.val == "" {
				continue
			}
			if err := set.write(id, set.val); err != nil {
				return errKeychainWrite
			}
		}
	}
	for id, der := range p.AgentKeys {
		if err := s.secret.SetAgentKey(id, der); err != nil {
			return errKeychainWrite
		}
	}
	var err error
	if p.AppLockHash != "" {
		err = s.secret.SetAppLockHash(p.AppLockHash)
	} else {
		err = s.secret.DeleteAppLockHash()
	}
	if err != nil {
		return errKeychainWrite
	}
	if err := s.secret.SetBackupPassword(password); err != nil {
		return errKeychainWrite
	}

	// What this Mac had and the backup does not goes, as its rows will.
	if servers, err := s.servers.List(); err == nil {
		for _, srv := range servers {
			if _, keep := p.Servers[srv.ID]; !keep {
				_ = s.secret.Delete(srv.ID)
			}
		}
	}
	if keys, err := s.keys.List(); err == nil {
		for _, k := range keys {
			if _, keep := p.AgentKeys[k.ID]; !keep {
				_ = s.secret.DeleteAgentKey(k.ID)
			}
		}
	}
	return nil
}
