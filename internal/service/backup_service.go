package service

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/backup"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

const (
	// BackupMinPassword is the shortest backup password accepted, in characters.
	BackupMinPassword = 10
	// backupKeepDays is how many days of this Mac's backups are kept.
	backupKeepDays = 7
	backupEvery    = 24 * time.Hour
	// Backups are checked shortly after start, then every hour.
	backupFirstCheck = 2 * time.Minute
	backupCheckEvery = time.Hour
)

// BackupStatus is what Settings › Data shows about backups.
type BackupStatus struct {
	Enabled bool `json:"enabled"`
	// Folder is where this Mac's backups go.
	Folder string `json:"folder"`
	ICloud bool   `json:"icloud"`
	// Available is false while iCloud Drive is off or the chosen folder is gone.
	Available bool  `json:"available"`
	Last      int64 `json:"last"` // unix ms of this Mac's newest backup; 0 = none
	Count     int   `json:"count"`
	Running   bool  `json:"running"`
	// Error is the last backup's failure, cleared by the next success.
	Error string `json:"error"`
}

// BackupEntry is one backup a restore can pick.
type BackupEntry struct {
	Path    string `json:"path"`
	Mac     string `json:"mac"`
	Created int64  `json:"created"` // unix ms
	Size    int64  `json:"size"`
	InCloud bool   `json:"inCloud"`
	ThisMac bool   `json:"thisMac"`
}

// BackupService makes and restores Zish's encrypted backups: the database
// and every Keychain item, sealed with a password only the user knows, in
// iCloud Drive or a folder they choose.
type BackupService struct {
	db       *gorm.DB
	dbPath   string
	dataDir  string
	home     string
	servers  *store.ServerRepo
	keys     *store.AgentKeyRepo
	settings *store.SettingsRepo
	secret   secret.Store
	gate     *LockGate
	bio      Biometrics
	mac      string
	app      string
	now      func() time.Time

	emit    func(BackupStatus)
	restart func()

	mu      sync.Mutex // one backup or restore at a time
	running atomic.Bool
	errMu   sync.Mutex
	lastErr string
}

// BackupDeps is what NewBackupService needs.
type BackupDeps struct {
	DB       *gorm.DB
	DBPath   string
	Home     string
	Servers  *store.ServerRepo
	Keys     *store.AgentKeyRepo
	Settings *store.SettingsRepo
	Secret   secret.Store
	Gate     *LockGate
	Bio      Biometrics
	// Hostname names this Mac's folder; App labels its backups.
	Hostname string
	App      string
}

// NewBackupService constructs the service.
func NewBackupService(d BackupDeps) *BackupService {
	return &BackupService{
		db: d.DB, dbPath: d.DBPath, dataDir: filepath.Dir(d.DBPath), home: d.Home,
		servers: d.Servers, keys: d.Keys, settings: d.Settings, secret: d.Secret,
		gate: d.Gate, bio: d.Bio, mac: backup.MacFolder(d.Hostname), app: d.App, now: time.Now,
	}
}

// SetBackupRuntime wires the status event and the restart a restore ends
// with. Package-level so neither becomes a frontend binding.
func SetBackupRuntime(s *BackupService, emit func(BackupStatus), restart func()) {
	s.emit, s.restart = emit, restart
}

var (
	errBackupsOff     = domain.NewError(domain.CodeValidation, "Backups are off.")
	errBackupLocked   = domain.NewError(domain.CodeValidation, "Unlock Zish first.")
	errBackupCanceled = domain.NewError(domain.CodeValidation, "Touch ID was cancelled, so nothing changed.")
	errBackupNoFolder = domain.NewError(domain.CodeValidation, "Turn on iCloud Drive in System Settings, or choose another folder.")
)

// root holds one folder per Mac.
func (s *BackupService) root() (string, bool) {
	if set, err := s.settings.Get(); err == nil && set.BackupFolder != "" {
		return set.BackupFolder, false
	}
	return backup.ICloudRoot(s.home), true
}

func (s *BackupService) available() bool {
	root, icloud := s.root()
	check := root
	if icloud {
		check = backup.ICloudDrive(s.home)
	}
	info, err := os.Stat(check)
	return err == nil && info.IsDir()
}

func (s *BackupService) enabled() bool {
	_, err := s.secret.GetBackupPassword()
	return err == nil
}

// Status reports whether backups are on, where they go and how they went.
func (s *BackupService) Status() BackupStatus {
	root, icloud := s.root()
	st := BackupStatus{
		Enabled: s.enabled(), Folder: filepath.Join(root, s.mac), ICloud: icloud,
		Available: s.available(), Running: s.running.Load(),
	}
	if entries, err := backup.List(root); err == nil {
		for _, e := range entries {
			if e.Mac != s.mac {
				continue
			}
			st.Count++
			if t := e.Created.UnixMilli(); t > st.Last {
				st.Last = t
			}
		}
	}
	s.errMu.Lock()
	st.Error = s.lastErr
	s.errMu.Unlock()
	return st
}

func (s *BackupService) setErr(err error) {
	s.errMu.Lock()
	s.lastErr = ""
	if err != nil {
		s.lastErr = errorText(err)
	}
	s.errMu.Unlock()
}

func errorText(err error) string {
	var de *domain.Error
	if errors.As(err, &de) {
		return de.Message
	}
	return err.Error()
}

func (s *BackupService) emitStatus() {
	if s.emit != nil {
		s.emit(s.Status())
	}
}

func checkBackupPassword(password string) error {
	if utf8.RuneCountInString(password) < BackupMinPassword {
		return domain.NewError(domain.CodeValidation, "Use at least 10 characters.")
	}
	return nil
}

// confirmOwner asks for Touch ID or the Mac password where the Mac has it.
func (s *BackupService) confirmOwner(reason string) error {
	if s.bio != nil && s.bio.Available() && !s.bio.Authenticate(reason) {
		return errBackupCanceled
	}
	return nil
}

// Enable turns backups on with password and makes the first one.
func (s *BackupService) Enable(password string) error {
	return s.setPassword(password, "turn on encrypted backups")
}

// ChangePassword makes new backups with password; older ones keep theirs.
func (s *BackupService) ChangePassword(password string) error {
	if !s.enabled() {
		return errBackupsOff
	}
	return s.setPassword(password, "change the backup password")
}

func (s *BackupService) setPassword(password, reason string) error {
	if s.gate.Locked() {
		return errBackupLocked
	}
	if err := checkBackupPassword(password); err != nil {
		return err
	}
	if !s.available() {
		return errBackupNoFolder
	}
	if err := s.confirmOwner(reason); err != nil {
		return err
	}
	if err := s.secret.SetBackupPassword(password); err != nil {
		return err
	}
	return s.backUp()
}

// Disable turns backups off. The files already made stay where they are.
func (s *BackupService) Disable() error {
	err := s.secret.DeleteBackupPassword()
	s.setErr(nil)
	s.emitStatus()
	return err
}

// BackUpNow makes a backup straight away.
func (s *BackupService) BackUpNow() error {
	if !s.enabled() {
		return errBackupsOff
	}
	return s.backUp()
}

// Reveal shows this Mac's backup folder (or the folder above it) in Finder.
func (s *BackupService) Reveal() error {
	root, _ := s.root()
	dir := filepath.Join(root, s.mac)
	if _, err := os.Stat(dir); err != nil {
		dir = root
	}
	if _, err := os.Stat(dir); err != nil {
		return errBackupNoFolder
	}
	return platform.RevealInFileManager(dir)
}

// List returns every Mac's backups in the backup folder, newest first.
func (s *BackupService) List() ([]BackupEntry, error) {
	root, _ := s.root()
	entries, err := backup.List(root)
	if err != nil {
		return nil, err
	}
	out := make([]BackupEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, BackupEntry{
			Path: e.Path, Mac: e.Mac, Created: e.Created.UnixMilli(), Size: e.Size,
			InCloud: e.InCloud, ThisMac: e.Mac == s.mac,
		})
	}
	return out, nil
}

// StartBackupSchedule backs up once a day while backups are on. Package-level
// so it never becomes a frontend binding.
func StartBackupSchedule(s *BackupService, stop <-chan struct{}) {
	go func() {
		t := time.NewTimer(backupFirstCheck)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
			}
			s.backUpIfDue()
			t.Reset(backupCheckEvery)
		}
	}()
}

func (s *BackupService) backUpIfDue() {
	if !s.enabled() {
		return
	}
	last := s.Status().Last
	if last != 0 && s.now().Sub(time.UnixMilli(last)) < backupEvery {
		return
	}
	_ = s.backUp()
}

func (s *BackupService) backUp() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.running.Store(true)
	s.emitStatus()
	err := s.writeBackup()
	s.running.Store(false)
	s.setErr(err)
	s.emitStatus()
	return err
}

func (s *BackupService) writeBackup() error {
	password, err := s.secret.GetBackupPassword()
	if errors.Is(err, secret.ErrNotStored) {
		return errBackupsOff
	}
	if err != nil {
		return err
	}
	if !s.available() {
		return errBackupNoFolder
	}
	p, err := s.collect()
	if err != nil {
		return err
	}
	defer wipePayload(&p)
	now := s.now()
	sealed, err := backup.Seal(p, password, backup.Meta{Created: now, Mac: s.mac, App: s.app})
	if err != nil {
		return err
	}
	root, _ := s.root()
	dir := filepath.Join(root, s.mac)
	if err := backup.Write(dir, backup.FileName(now), sealed); err != nil {
		return domain.NewError(domain.CodeValidation, "Cannot write the backup. Check that the folder is writable.")
	}
	return backup.Prune(dir, backupKeepDays)
}
