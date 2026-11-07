package service

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/backup"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

func init() {
	backup.DefaultKDF = backup.KDF{Time: 1, Memory: 1 << 10, Threads: 1}
}

type backupFixture struct {
	svc      *BackupService
	sec      *secret.Fake
	servers  *store.ServerRepo
	keys     *store.AgentKeyRepo
	dbPath   string
	folder   string
	restarts int
	statuses []BackupStatus
}

// newBackupFixture is one Mac: its own database and Keychain, backing up to
// folder (shared between fixtures, as iCloud Drive is between Macs).
func newBackupFixture(t *testing.T, mac, folder string) *backupFixture {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "sshmgr.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	settings := store.NewSettingsRepo(db)
	set, err := settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	set.BackupFolder = folder
	if err := settings.Save(set); err != nil {
		t.Fatal(err)
	}
	f := &backupFixture{sec: secret.NewFake(), servers: store.NewServerRepo(db), keys: store.NewAgentKeyRepo(db), dbPath: dbPath, folder: folder}
	f.svc = NewBackupService(BackupDeps{
		DB: db, DBPath: dbPath, Home: t.TempDir(), Servers: f.servers, Keys: f.keys, Settings: settings,
		Secret: f.sec, Gate: NewLockGate(false), Hostname: mac + ".local", App: "test",
	})
	SetBackupRuntime(f.svc, func(st BackupStatus) { f.statuses = append(f.statuses, st) }, func() { f.restarts++ })
	return f
}

func (f *backupFixture) addServer(t *testing.T, id, password string) {
	t.Helper()
	if err := f.servers.Create(&domain.Server{ID: id, Name: id, Host: id + ".example", Port: 22, User: "u", AuthType: domain.AuthPassword}); err != nil {
		t.Fatal(err)
	}
	if password != "" {
		if err := f.sec.SetPassword(id, password); err != nil {
			t.Fatal(err)
		}
	}
}

func (f *backupFixture) addKey(t *testing.T, id string, der []byte) {
	t.Helper()
	k := &domain.AgentKey{ID: id, Name: id, Type: "ssh-ed25519", Fingerprint: "SHA256:" + id, PublicKey: "ssh-ed25519 AAAA" + id}
	if err := f.keys.Create(k); err != nil {
		t.Fatal(err)
	}
	if err := f.sec.SetAgentKey(id, der); err != nil {
		t.Fatal(err)
	}
}

const goodPassword = "correct horse battery"

func TestBackupEnableChecksBeforeStoring(t *testing.T) {
	f := newBackupFixture(t, "Studio", t.TempDir())
	if err := f.svc.Enable("short"); err == nil {
		t.Fatal("a short password was accepted")
	}
	f.svc.gate.Lock()
	if err := f.svc.Enable(goodPassword); !errors.Is(err, errBackupLocked) {
		t.Fatalf("locked: %v", err)
	}
	f.svc.gate.Unlock()
	f.svc.bio = fakeBio{ok: false}
	if err := f.svc.Enable(goodPassword); !errors.Is(err, errBackupCanceled) {
		t.Fatalf("cancelled Touch ID: %v", err)
	}
	if f.svc.Status().Enabled {
		t.Fatal("backups turned on without the owner's say-so")
	}
	gone := newBackupFixture(t, "Studio", filepath.Join(t.TempDir(), "unplugged"))
	if err := gone.svc.Enable(goodPassword); !errors.Is(err, errBackupNoFolder) {
		t.Fatalf("missing folder: %v", err)
	}
}

func TestBackupWritesEverythingEncrypted(t *testing.T) {
	f := newBackupFixture(t, "Studio", t.TempDir())
	f.addServer(t, "api", "hunter2")
	if err := f.sec.SetTOTPSecret("api", "JBSWY3DPEHPK3PXP"); err != nil {
		t.Fatal(err)
	}
	f.addServer(t, "web", "")
	f.addKey(t, "k1", []byte{0x30, 0x82, 0x01, 0x02})
	if err := f.sec.SetAppLockHash("$2a$10$hash"); err != nil {
		t.Fatal(err)
	}

	if err := f.svc.Enable(goodPassword); err != nil {
		t.Fatal(err)
	}
	st := f.svc.Status()
	if !st.Enabled || st.Count != 1 || st.Last == 0 || st.Running || st.Error != "" || st.ICloud {
		t.Fatalf("status = %+v", st)
	}
	if st.Folder != filepath.Join(f.folder, "Studio") {
		t.Fatalf("folder = %s", st.Folder)
	}
	if len(f.statuses) < 2 || !f.statuses[0].Running {
		t.Fatalf("status events = %+v", f.statuses)
	}

	list, err := f.svc.List()
	if err != nil || len(list) != 1 || !list[0].ThisMac || list[0].Mac != "Studio" {
		t.Fatalf("list = %+v, %v", list, err)
	}
	raw, err := os.ReadFile(list[0].Path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("hunter2")) {
		t.Fatal("a password is in clear")
	}
	h, p, err := backup.Open(raw, goodPassword)
	if err != nil {
		t.Fatal(err)
	}
	if h.Mac != "Studio" || h.App != "test" {
		t.Fatalf("header = %+v", h)
	}
	if !bytes.HasPrefix(p.Database, []byte(sqliteMagic)) {
		t.Fatal("no database in the backup")
	}
	if p.Servers["api"] != (backup.ServerSecrets{Password: "hunter2", TOTP: "JBSWY3DPEHPK3PXP"}) {
		t.Fatalf("api secrets = %+v", p.Servers["api"])
	}
	if _, ok := p.Servers["web"]; ok {
		t.Fatal("a server without secrets got an entry")
	}
	if !bytes.Equal(p.AgentKeys["k1"], []byte{0x30, 0x82, 0x01, 0x02}) || p.AppLockHash != "$2a$10$hash" {
		t.Fatalf("keys/lock = %v %q", p.AgentKeys, p.AppLockHash)
	}
}

func TestBackupFailsRatherThanDropSecrets(t *testing.T) {
	f := newBackupFixture(t, "Studio", t.TempDir())
	f.addServer(t, "api", "hunter2")
	if err := f.svc.Enable(goodPassword); err != nil {
		t.Fatal(err)
	}
	f.sec.FailWith(domain.NewError(domain.CodeKeychain, "locked keychain"))
	if err := f.svc.BackUpNow(); err == nil {
		t.Fatal("a backup without the Keychain was made")
	}
}

func TestBackupOnlyWhenDue(t *testing.T) {
	f := newBackupFixture(t, "Studio", t.TempDir())
	f.svc.backUpIfDue() // off: nothing
	if f.svc.Status().Count != 0 {
		t.Fatal("backed up while off")
	}
	if err := f.svc.Enable(goodPassword); err != nil {
		t.Fatal(err)
	}
	base := time.Now()
	f.svc.now = func() time.Time { return base.Add(time.Hour) }
	f.svc.backUpIfDue()
	if got := f.svc.Status().Count; got != 1 {
		t.Fatalf("an hour later: %d backups", got)
	}
	f.svc.now = func() time.Time { return base.Add(25 * time.Hour) }
	f.svc.backUpIfDue()
	if got := f.svc.Status().Count; got != 2 {
		t.Fatalf("a day later: %d backups", got)
	}
}

func TestRestoreOntoAnotherMac(t *testing.T) {
	shared := t.TempDir()
	old := newBackupFixture(t, "OldMac", shared)
	old.addServer(t, "api", "hunter2")
	old.addKey(t, "k1", []byte{0x30, 0x01})
	if err := old.svc.Enable(goodPassword); err != nil {
		t.Fatal(err)
	}

	mac := newBackupFixture(t, "NewMac", shared)
	mac.addServer(t, "local", "mine")
	mac.addKey(t, "k2", []byte{0x30, 0x02})
	list, err := mac.svc.List()
	if err != nil || len(list) != 1 || list[0].ThisMac {
		t.Fatalf("list = %+v, %v", list, err)
	}

	if err := mac.svc.Restore(list[0].Path, "wrong password"); !errors.Is(err, errBadPassword) {
		t.Fatalf("wrong password: %v", err)
	}
	if _, err := os.Stat(store.PendingRestorePath(mac.dbPath)); !os.IsNotExist(err) {
		t.Fatal("a failed restore left a pending database")
	}
	if err := mac.svc.Restore(filepath.Join(shared, "elsewhere.zishbackup"), goodPassword); err == nil {
		t.Fatal("restored a file the list never offered")
	}

	if err := mac.svc.Restore(list[0].Path, goodPassword); err != nil {
		t.Fatal(err)
	}
	if mac.restarts != 1 {
		t.Fatalf("restarts = %d", mac.restarts)
	}
	staged, err := os.ReadFile(store.PendingRestorePath(mac.dbPath))
	if err != nil || !bytes.HasPrefix(staged, []byte(sqliteMagic)) {
		t.Fatalf("staged database: %v", err)
	}
	if pw, _ := mac.sec.GetPassword("api"); pw != "hunter2" {
		t.Fatalf("restored password = %q", pw)
	}
	if der, _ := mac.sec.GetAgentKey("k1"); !bytes.Equal(der, []byte{0x30, 0x01}) {
		t.Fatalf("restored key = %v", der)
	}
	if _, err := mac.sec.GetPassword("local"); !errors.Is(err, secret.ErrNotStored) {
		t.Fatal("this Mac's own server secret survived a full restore")
	}
	if _, err := mac.sec.GetAgentKey("k2"); !errors.Is(err, secret.ErrNotStored) {
		t.Fatal("this Mac's own key survived a full restore")
	}
	if pw, _ := mac.sec.GetBackupPassword(); pw != goodPassword {
		t.Fatal("backups do not carry on after the restore")
	}
}

func TestRestoreRefusedWhileLocked(t *testing.T) {
	f := newBackupFixture(t, "Studio", t.TempDir())
	f.svc.gate.Lock()
	if err := f.svc.Restore("whatever", goodPassword); !errors.Is(err, errBackupLocked) {
		t.Fatalf("locked restore: %v", err)
	}
}

func TestResetAllTurnsBackupsOff(t *testing.T) {
	f := newBackupFixture(t, "Studio", t.TempDir())
	if err := f.sec.SetBackupPassword(goodPassword); err != nil {
		t.Fatal(err)
	}
	if err := f.sec.SetAppLockHash("$2a$10$x"); err != nil {
		t.Fatal(err)
	}
	lock := NewLockService(f.sec, f.servers, f.svc.settings, NewLockGate(true), nil)
	SetLockAgent(lock, NewAgentService(f.keys, store.NewSignLogRepo(f.svc.db), f.servers, f.sec, t.TempDir()))
	if err := lock.ResetAll(); err != nil {
		t.Fatal(err)
	}
	if _, err := f.sec.GetBackupPassword(); !errors.Is(err, secret.ErrNotStored) {
		t.Fatal("a reset left daily backups of the empty app running")
	}
}
