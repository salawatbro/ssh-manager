package store

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func TestOpenCreatesDatabaseWithWAL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}

	var mode string
	if err := db.Raw("PRAGMA journal_mode").Scan(&mode).Error; err != nil {
		t.Fatalf("reading journal_mode: %v", err)
	}
	// NFR-04: crash bo'lganda ma'lumot yo'qolmasligi uchun WAL
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want %q", mode, "wal")
	}
}

func TestOpenSetsDatabaseFileTo0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permissions are not meaningful on Windows")
	}
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	if _, err := Open(path); err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", path, err)
	}
	// SEC-05: DB fayl 0600
	if got := info.Mode().Perm(); got != 0o600 {
		t.Errorf("db file mode = %#o, want 0600", got)
	}
}

// TestOpenSetsWALSideFilesTo0600 is the test TestOpenSetsDatabaseFileTo0600
// cannot be: that test only ever checks sshmgr.db itself, and under WAL mode
// the main file stays empty — every row a session writes lives in
// "sshmgr.db-wal" until a checkpoint, and a fresh WAL is created 0644 (0666
// & ~umask) unless the main database was already 0600 the moment SQLite
// created it. A reviewer confirmed this on a real disk: a server's hostname
// was present in "-wal" and absent from ".db".
//
// This forces a row into existence (AutoMigrate's own writes already create
// the WAL, but an explicit Create leaves no doubt) and then asserts both
// side files, not just the main one.
func TestOpenSetsWALSideFilesTo0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permissions are not meaningful on Windows")
	}
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	if err := db.Create(&domain.Server{
		ID:   "srv-1",
		Name: "server-1",
		Host: "example.com",
		User: "root",
	}).Error; err != nil {
		t.Fatalf("Create: %v", err)
	}

	for _, side := range []string{path + "-wal", path + "-shm"} {
		info, err := os.Stat(side)
		if err != nil {
			// journal_mode=WAL (asserted by TestOpenCreatesDatabaseWithWAL)
			// means these must exist once a row has been written; a missing
			// file here is its own bug, not something to skip past.
			t.Fatalf("Stat(%q) error = %v", side, err)
		}
		// SEC-05: the WAL and its shared-memory index hold the actual data
		// under WAL mode and must be 0600 too, not just the main .db file.
		if got := info.Mode().Perm(); got != 0o600 {
			t.Errorf("%s mode = %#o, want 0600", side, got)
		}
	}
}

// TestOpenRepairsStaleWALSideFilePermissions is the test the ordering fix
// (chmod dbPath to 0600 before AutoMigrate, see the comment on Open) cannot
// cover: that fix only ever handles a *fresh* "-wal"/"-shm" pair, one SQLite
// is creating for the first time, by making sure the main file is already
// 0600 the moment SQLite copies its mode onto the new side file. It does
// nothing for a "-wal"/"-shm" pair that already exists at 0644 before Open
// runs — left behind by a build predating this fix, or dropped in by a
// backup restore — because SQLite never re-chmods a side file it did not
// just create itself. That is not hypothetical: it is exactly the state a
// reviewer found on a real disk, sshmgr.db sitting at 0600 next to
// sshmgr.db-wal at 0644 holding every row. The two explicit
// chmod600(dbPath+"-wal"/"-shm") calls in Open exist solely to repair that
// case; delete them and this test — not TestOpenSetsWALSideFilesTo0600 —
// is what fails.
func TestOpenRepairsStaleWALSideFilePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permissions are not meaningful on Windows")
	}
	path := filepath.Join(t.TempDir(), "sshmgr.db")
	walPath := path + "-wal"
	shmPath := path + "-shm"

	// Seed a *real* "-wal"/"-shm" pair, not garbage bytes. Verified by a
	// throwaway experiment before writing this test: seeding walPath/shmPath
	// with garbage content at 0644 does make Open succeed, but SQLite
	// silently discards the unreadable WAL and writes a brand new one in
	// its place (confirmed via os.SameFile: the post-Open "-wal" is a
	// different inode from the seeded one). A freshly-created WAL already
	// inherits 0600 from the ordering fix regardless of whether the repair
	// calls this test protects exist at all, so that seeding would pass
	// for the wrong reason and prove nothing.
	//
	// So: open for real and write a row to get genuine side files, and
	// deliberately do NOT close the handle. Closing checkpoints WAL/SHM
	// away entirely (confirmed while investigating this same bug: a
	// sqlDB.Close() shrinks them to nothing and grows the main file to
	// absorb the data) — closing here would leave nothing at 0644 to seed.
	seedDB, err := Open(path)
	if err != nil {
		t.Fatalf("seeding Open(%q) error = %v", path, err)
	}
	t.Cleanup(func() {
		if sqlDB, err := seedDB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	if err := seedDB.Create(&domain.Server{
		ID:   "srv-seed",
		Name: "seed-server",
		Host: "example.com",
		User: "root",
	}).Error; err != nil {
		t.Fatalf("seed Create: %v", err)
	}

	if err := os.Chmod(walPath, 0o644); err != nil {
		t.Fatalf("chmod %s to 0644: %v", walPath, err)
	}
	if err := os.Chmod(shmPath, 0o644); err != nil {
		t.Fatalf("chmod %s to 0644: %v", shmPath, err)
	}

	// Confirm the seed actually took, and remember which files these are so
	// the second Open cannot silently pass by deleting/recreating them.
	var before [2]os.FileInfo
	for i, p := range []string{walPath, shmPath} {
		info, err := os.Stat(p)
		if err != nil {
			t.Fatalf("Stat(%q) error = %v", p, err)
		}
		if got := info.Mode().Perm(); got != 0o644 {
			t.Fatalf("%s mode = %#o right before Open, want 0644 (seeding did not take)", p, got)
		}
		before[i] = info
	}

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	for i, p := range []string{walPath, shmPath} {
		info, err := os.Stat(p)
		if err != nil {
			t.Fatalf("Stat(%q) error = %v", p, err)
		}
		if !os.SameFile(before[i], info) {
			t.Fatalf("%s was deleted/recreated by Open rather than repaired in place; "+
				"this run proves nothing about the stale-file repair calls", p)
		}
		// SEC-05: a stale 0644 side file left from before this fix, or
		// restored from a backup, must come back 0600 too.
		if got := info.Mode().Perm(); got != 0o600 {
			t.Errorf("%s mode = %#o, want 0600 (stale 0644 side file was not repaired)", p, got)
		}
	}
}

func TestOpenCreatesMissingParentDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "deeper", "sshmgr.db")

	if _, err := Open(path); err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("database was not created: %v", err)
	}
}

func TestOpenMigratesServerTable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	if !db.Migrator().HasTable(&domain.Server{}) {
		t.Error("servers table was not created")
	}
}

func TestOpenIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	if _, err := Open(path); err != nil {
		t.Fatalf("first Open error = %v", err)
	}
	if _, err := Open(path); err != nil {
		t.Fatalf("second Open error = %v", err)
	}
}

// TestDanglingForeignKeyRejectedOnEveryPooledConnection is the regression
// test for the bug this file's Open fixes: PRAGMA foreign_keys is a
// per-connection setting, and a db.Exec loop only ever reached one
// connection out of GORM's pool. Before the fix, 19 of 20 concurrent
// inserts with a dangling JumpID were silently accepted — only the insert
// that happened to land on the one pragma'd connection was rejected.
//
// A single insert would not catch this: it might land on the lucky
// connection by chance and prove nothing. Firing N concurrent inserts and
// requiring every single one to fail is what gives this test teeth.
func TestDanglingForeignKeyRejectedOnEveryPooledConnection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("db.DB() error = %v", err)
	}
	// Let the pool actually spread the concurrent inserts across several
	// physical connections instead of serializing them onto one.
	sqlDB.SetMaxOpenConns(8)

	dangling := "does-not-exist"

	const n = 20
	errs := make([]error, n)
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			srv := domain.Server{
				ID:     fmt.Sprintf("srv-%d", i),
				Name:   fmt.Sprintf("server-%d", i),
				Host:   "example.com",
				User:   "root",
				JumpID: &dangling,
			}
			errs[i] = db.Create(&srv).Error
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err == nil {
			t.Errorf("insert %d with a dangling JumpID succeeded, want a foreign key violation", i)
		}
	}
}

// TestPragmasHoldOnASecondPooledConnection grabs two connections out of the
// pool concurrently — so the pool cannot satisfy the test by quietly
// handing back the same connection twice — and checks PRAGMA foreign_keys
// reads 1 on both. Before the fix, only the first connection Open ever
// touched had the pragma applied; every other connection kept SQLite's
// default of foreign_keys OFF.
func TestPragmasHoldOnASecondPooledConnection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sshmgr.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("db.DB() error = %v", err)
	}
	sqlDB.SetMaxOpenConns(8)

	ctx := context.Background()

	const n = 2
	results := make([]string, n)
	errs := make([]error, n)

	var acquired sync.WaitGroup
	acquired.Add(n)
	release := make(chan struct{})

	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			conn, err := sqlDB.Conn(ctx)
			if err != nil {
				errs[i] = err
				acquired.Done()
				return
			}
			defer func() { _ = conn.Close() }()
			acquired.Done()
			<-release // don't query until both connections are checked out

			errs[i] = conn.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&results[i])
		}(i)
	}
	acquired.Wait()
	close(release)
	wg.Wait()

	for i := 0; i < n; i++ {
		if errs[i] != nil {
			t.Fatalf("connection %d: %v", i, errs[i])
		}
		if results[i] != "1" {
			t.Errorf("connection %d: PRAGMA foreign_keys = %q, want %q", i, results[i], "1")
		}
	}
}

// TestOpenPathWithSpaceInDirectoryName is a regression guard on the DSN's
// path escaping. It mirrors the real macOS data directory
// ("~/Library/Application Support/SSHManager/sshmgr.db"), which contains a
// literal space today, not hypothetically.
func TestOpenPathWithSpaceInDirectoryName(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "Application Support", "SSHManager")
	path := filepath.Join(dir, "sshmgr.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open(%q) error = %v", path, err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Fatalf("database file was not created at %s: %v", path, err)
	}

	var fk string
	if err := db.Raw("PRAGMA foreign_keys").Scan(&fk).Error; err != nil {
		t.Fatalf("reading foreign_keys: %v", err)
	}
	if fk != "1" {
		t.Errorf("foreign_keys = %q, want %q", fk, "1")
	}
}
