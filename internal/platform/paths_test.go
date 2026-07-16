package platform

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDataDirEndsWithAppFolder(t *testing.T) {
	dir, err := DataDir()
	if err != nil {
		t.Fatalf("DataDir() error = %v", err)
	}
	if filepath.Base(dir) != "SSHManager" {
		t.Errorf("DataDir() = %q, want it to end with SSHManager", dir)
	}
}

// isolate points os.UserConfigDir at a throwaway folder.
//
// XDG_CONFIG_HOME must be cleared too: on Linux UserConfigDir prefers it over
// HOME, so setting HOME alone leaves the test writing into the developer's
// real config directory.
func isolate(t *testing.T) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permissions are not meaningful on Windows")
	}
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("XDG_CONFIG_HOME", "")
	return tmp
}

func TestEnsureDataDirCreatesWith0700(t *testing.T) {
	tmp := isolate(t)

	dir, err := EnsureDataDir()
	if err != nil {
		t.Fatalf("EnsureDataDir() error = %v", err)
	}
	if !strings.HasPrefix(dir, tmp) {
		t.Fatalf("EnsureDataDir() = %q, want it under %q", dir, tmp)
	}

	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", dir, err)
	}
	// SEC-05: ma'lumot papkasi 0700
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("data dir mode = %#o, want 0700", got)
	}
}

// This is the test that gives the Chmod in EnsureDataDir any teeth.
//
// TestEnsureDataDirCreatesWith0700 cannot: MkdirAll(0o700) already yields 0700
// on a folder it creates, so it passes whether or not the Chmod exists. Only a
// folder that already exists with a loose mode tells the two apart — MkdirAll
// no-ops on it, and without the Chmod the folder stays 0755 (SEC-05 quietly
// broken).
//
// Delete the Chmod from EnsureDataDir and this test must fail. If it does not,
// the test is worthless — fix the test, not the assertion.
func TestEnsureDataDirTightensAnExistingLooseFolder(t *testing.T) {
	isolate(t)

	dir, err := DataDir()
	if err != nil {
		t.Fatalf("DataDir() error = %v", err)
	}
	// Seed the folder the way an older build or a restore would leave it.
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("seeding the folder: %v", err)
	}
	if err := os.Chmod(dir, 0o755); err != nil {
		t.Fatalf("seeding the mode: %v", err)
	}

	if _, err := EnsureDataDir(); err != nil {
		t.Fatalf("EnsureDataDir() error = %v", err)
	}

	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", dir, err)
	}
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("data dir mode = %#o, want 0700 — MkdirAll does nothing to an "+
			"existing folder, so Chmod must tighten it (SEC-05)", got)
	}
}

func TestEnsureDataDirIsIdempotent(t *testing.T) {
	isolate(t)

	first, err := EnsureDataDir()
	if err != nil {
		t.Fatalf("first EnsureDataDir() error = %v", err)
	}
	second, err := EnsureDataDir()
	if err != nil {
		t.Fatalf("second EnsureDataDir() error = %v", err)
	}
	if first != second {
		t.Errorf("EnsureDataDir() not stable: %q then %q", first, second)
	}
}

// TestLogDirSitsInDataDir is LogDir's first test. Nothing called LogDir
// before main.go's fatal-startup path was wired to use it, and a reviewer
// flagged it as dead code with 0% coverage; this exercises it directly so
// that flag is retired regardless of what main.go ends up doing with it.
func TestLogDirSitsInDataDir(t *testing.T) {
	logDir, err := LogDir()
	if err != nil {
		t.Fatalf("LogDir() error = %v", err)
	}
	dir, err := DataDir()
	if err != nil {
		t.Fatalf("DataDir() error = %v", err)
	}
	if want := filepath.Join(dir, "logs"); logDir != want {
		t.Errorf("LogDir() = %q, want %q", logDir, want)
	}
}

func TestDBPathSitsInDataDir(t *testing.T) {
	db, err := DBPath()
	if err != nil {
		t.Fatalf("DBPath() error = %v", err)
	}
	dir, err := DataDir()
	if err != nil {
		t.Fatalf("DataDir() error = %v", err)
	}
	if want := filepath.Join(dir, "sshmgr.db"); db != want {
		t.Errorf("DBPath() = %q, want %q", db, want)
	}
}
