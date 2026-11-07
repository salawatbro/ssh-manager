package store

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

// A restore cannot replace the database the running app holds open, so it
// leaves the new file next to it and the next start swaps it in before
// opening anything.

// PendingRestorePath is where a restore leaves the database for the next start.
func PendingRestorePath(dbPath string) string { return dbPath + ".restore" }

// PreviousPath is where the database a restore replaced is kept.
func PreviousPath(dbPath string) string {
	return strings.TrimSuffix(dbPath, ".db") + ".before-restore.db"
}

// sqliteSidecars are the files SQLite keeps beside a database; they belong to
// it and move with it, or the old WAL would be replayed into the new file.
var sqliteSidecars = []string{"", "-wal", "-shm"}

// ApplyPendingRestore swaps a pending restore in for the database at dbPath,
// keeping the replaced one at PreviousPath. It reports whether it swapped.
func ApplyPendingRestore(dbPath string) (bool, error) {
	pending := PendingRestorePath(dbPath)
	if _, err := os.Stat(pending); errors.Is(err, os.ErrNotExist) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	prev := PreviousPath(dbPath)
	for _, sfx := range sqliteSidecars {
		if err := os.Remove(prev + sfx); err != nil && !errors.Is(err, os.ErrNotExist) {
			return false, fmt.Errorf("cannot clear the previous copy: %w", err)
		}
	}
	for _, sfx := range sqliteSidecars {
		if err := os.Rename(dbPath+sfx, prev+sfx); err != nil && !errors.Is(err, os.ErrNotExist) {
			return false, fmt.Errorf("cannot set the current database aside: %w", err)
		}
	}
	if err := os.Rename(pending, dbPath); err != nil {
		return false, fmt.Errorf("cannot move the restored database in place: %w", err)
	}
	return true, nil
}
