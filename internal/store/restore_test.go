package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestApplyPendingRestore(t *testing.T) {
	dir := t.TempDir()
	db := filepath.Join(dir, "sshmgr.db")
	write := func(p, body string) {
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	read := func(p string) string {
		b, err := os.ReadFile(p)
		if err != nil {
			return "<missing>"
		}
		return string(b)
	}

	if swapped, err := ApplyPendingRestore(db); err != nil || swapped {
		t.Fatalf("nothing pending: %v %v", swapped, err)
	}

	write(db, "old")
	write(db+"-wal", "old wal")
	write(PreviousPath(db)+"-shm", "stale")
	write(PendingRestorePath(db), "restored")

	swapped, err := ApplyPendingRestore(db)
	if err != nil || !swapped {
		t.Fatalf("swap: %v %v", swapped, err)
	}
	if got := read(db); got != "restored" {
		t.Fatalf("db = %q", got)
	}
	// The old WAL must not stay beside the restored file.
	if got := read(db + "-wal"); got != "<missing>" {
		t.Fatalf("wal left behind: %q", got)
	}
	prev := PreviousPath(db)
	if read(prev) != "old" || read(prev+"-wal") != "old wal" || read(prev+"-shm") != "<missing>" {
		t.Fatalf("previous = %q %q %q", read(prev), read(prev+"-wal"), read(prev+"-shm"))
	}
	if read(PendingRestorePath(db)) != "<missing>" {
		t.Fatal("pending file left behind")
	}
}

func TestApplyPendingRestoreOnAFreshMac(t *testing.T) {
	db := filepath.Join(t.TempDir(), "sshmgr.db")
	if err := os.WriteFile(PendingRestorePath(db), []byte("restored"), 0o600); err != nil {
		t.Fatal(err)
	}
	if swapped, err := ApplyPendingRestore(db); err != nil || !swapped {
		t.Fatalf("swap: %v %v", swapped, err)
	}
	if _, err := os.Stat(PreviousPath(db)); !os.IsNotExist(err) {
		t.Fatalf("a previous copy appeared from nothing: %v", err)
	}
}
