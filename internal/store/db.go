// Package store persists domain types in SQLite.
package store

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/salawat/sshmgr/internal/domain"
)

// sqlitePragmas are the four PRAGMAs the app relies on, spelled the way
// glebarez/go-sqlite's DSN parser wants them: "name(value)", joined into a
// query string. See dsn's comment for why they live here and not in a
// db.Exec call.
const sqlitePragmas = "" +
	"_pragma=journal_mode(WAL)" + // NFR-04: survive a crash
	"&_pragma=busy_timeout(5000)" + // wait instead of failing on a lock
	"&_pragma=foreign_keys(1)" + // enforce the jump-host reference
	"&_pragma=synchronous(NORMAL)" // the safe pairing with WAL

// dsn builds the SQLite connection string for dbPath.
//
// This is a DSN with "_pragma=" query parameters, not four
// db.Exec("PRAGMA ...") calls, because PRAGMA foreign_keys, busy_timeout
// and synchronous are per-connection settings, while GORM's *sql.DB holds a
// connection *pool*. db.Exec only reaches whichever single connection
// happens to be checked out at that moment; every other connection the pool
// later hands out was never touched and keeps SQLite's defaults —
// foreign_keys OFF among them. Measured: with the old db.Exec loop, 19 of
// 20 concurrent inserts of a dangling jump_id were accepted, because only
// the one connection that ran the loop enforced the constraint.
// glebarez/go-sqlite reads "_pragma=" parameters out of the DSN itself and
// re-applies them to *every* connection it opens (see applyQueryParams in
// github.com/glebarez/go-sqlite), which is the only place that setting
// reaches the whole pool. Do not "simplify" this back into a db.Exec loop —
// see TestDanglingForeignKeyRejectedOnEveryPooledConnection and
// TestPragmasHoldOnASecondPooledConnection in db_test.go, which fail
// immediately if you do.
//
// dbPath is percent-escaped segment by segment rather than pasted straight
// into the "file:" URI, because a real dbPath can carry characters a raw
// URI can't: a space (today's actual macOS path,
// "~/Library/Application Support/SSHManager/sshmgr.db"), or a "?"/"#"
// (either starts a URI query/fragment and silently misroutes the path —
// confirmed empirically: a literal "#" in the directory name makes the
// naive "file:"+dbPath+"?..." form open *successfully* while creating no
// file at all at the intended location). filepath.ToSlash plus a forced
// leading "/" also produces the exact form SQLite's own docs use for a
// Windows drive letter: "file:///C:/Users/.../sshmgr.db".
func dsn(dbPath string) string {
	return "file://" + escapeDSNPath(dbPath) + "?" + sqlitePragmas
}

// escapeDSNPath turns an OS file path into the path component of a
// "file://" SQLite URI.
func escapeDSNPath(p string) string {
	segments := strings.Split(filepath.ToSlash(p), "/")
	for i, s := range segments {
		segments[i] = url.PathEscape(s)
	}
	joined := strings.Join(segments, "/")
	if !strings.HasPrefix(joined, "/") {
		// A bare Windows drive letter ("C:/Users/...") has no leading
		// slash to begin with; without one, "file://C:/..." reads "C" as
		// the URI host and ":/..." as a bogus port.
		joined = "/" + joined
	}
	return joined
}

// Open opens (creating if needed) the SQLite database at dbPath, applies the
// pragmas the app relies on, and migrates the schema.
//
// The driver is glebarez/sqlite on purpose: it is pure Go, so this package
// builds with CGO_ENABLED=0 and needs no C toolchain for SQLite.
// gorm.io/driver/sqlite must not be used — it wraps mattn/go-sqlite3 (cgo).
//
// The app binary itself still links cgo, because Wails' platform layer does
// (TZ 14.1). That is unavoidable; keeping SQLite out of cgo is not.
func Open(dbPath string) (*gorm.DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		return nil, fmt.Errorf(
			"cannot create the folder for %s; check the parent folder exists and is writable: %w", dbPath, err)
	}

	db, err := gorm.Open(sqlite.Open(dsn(dbPath)), &gorm.Config{
		// The default logger prints every statement to stdout, which would
		// put user data in the terminal. Keep it quiet (SEC-06).
		Logger: logger.Discard,
	})
	if err != nil {
		return nil, fmt.Errorf(
			"cannot open the database %s; check that the path is valid and the file is not corrupted: %w", dbPath, err)
	}

	// SEC-05, and the ordering here is load-bearing — measured with a scratch
	// program, not assumed: gorm.Open above already creates dbPath on disk
	// (0666 & ~umask, 0644 under the default umask of 022) before a single
	// row is written. This chmod runs here, before AutoMigrate, because
	// AutoMigrate's first write is what forces SQLite to create the "-wal"/
	// "-shm" side files under WAL mode, and SQLite copies the *main
	// database's mode at that moment* onto them. Chmodding after AutoMigrate
	// (the previous bug here) is too late: the WAL is already 0644 and
	// world-readable, and it — not the still-empty main file — holds every
	// row until the next checkpoint. Confirmed empirically: chmod before
	// AutoMigrate produces a 0600 "-wal"; chmod after produces a 0644 one.
	// Delete this and TestOpenSetsDatabaseFileTo0600 fails.
	if err := chmod600(dbPath); err != nil {
		return nil, fmt.Errorf(
			"cannot set 0600 on the database %s; check that you own it: %w", dbPath, err)
	}
	// A "-wal"/"-shm" pair can already sit here at 0644 — left over from a
	// run before this ordering fix existed, or from a backup restore — and
	// SQLite never chmods a side file it did not just create itself.
	// Fixing dbPath's mode above does nothing to repair those; they need
	// fixing directly. chmod600 no-ops if either is absent, which is the
	// common case on a fresh Open.
	if err := chmod600(dbPath + "-wal"); err != nil {
		return nil, fmt.Errorf(
			"cannot set 0600 on %s-wal; check that you own it: %w", dbPath, err)
	}
	if err := chmod600(dbPath + "-shm"); err != nil {
		return nil, fmt.Errorf(
			"cannot set 0600 on %s-shm; check that you own it: %w", dbPath, err)
	}

	if err := db.AutoMigrate(&domain.Server{}, &domain.Settings{}); err != nil {
		return nil, fmt.Errorf("cannot migrate the schema: %w", err)
	}

	return db, nil
}

// chmod600 sets 0600 on path, silently succeeding if path does not exist. A
// freshly opened database has no "-wal"/"-shm" side files yet, and that is
// the common, unremarkable case — not an error.
func chmod600(path string) error {
	if err := os.Chmod(path, 0o600); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return nil
}
