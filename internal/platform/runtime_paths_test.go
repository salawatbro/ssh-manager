//go:build unix

package platform

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestIsShellSafePath(t *testing.T) {
	safe := []string{"/Users/me/Library/Caches/SSHManager/launch", "/var/folders/x_/T/uz.salawat.sshmgr/launch", "/a+b/c-d/e.f"}
	for _, p := range safe {
		if !IsShellSafePath(p) {
			t.Errorf("IsShellSafePath(%q) = false", p)
		}
	}
	unsafe := []string{"", "relative/path", "/Users/John Smith/x", "/a/$(id)", "/a/`id`", "/a/b;c", "/a/'b'", "/a/\"b\"", "/a/b\nc", "/a/ü", "/a/*", "/a/~b"}
	for _, p := range unsafe {
		if IsShellSafePath(p) {
			t.Errorf("IsShellSafePath(%q) = true", p)
		}
	}
}

func TestLaunchDirFallsBackWhenHomeIsNotShellSafe(t *testing.T) {
	got, err := launchDirFrom("/Users/me/Library/Caches/SSHManager", "/tmp/T")
	if err != nil || got != "/Users/me/Library/Caches/SSHManager/launch" {
		t.Fatalf("got %q, %v", got, err)
	}
	got, err = launchDirFrom("/Users/John Smith/Library/Caches/SSHManager", "/tmp/T")
	if err != nil || got != "/tmp/T/uz.salawat.sshmgr/launch" {
		t.Fatalf("fallback = %q, %v", got, err)
	}
	if _, err := launchDirFrom("/Users/a b/c", "/tmp/a b"); !errors.Is(err, ErrUnsafeDir) {
		t.Fatalf("no safe dir: err = %v", err)
	}
}

func TestSocketPathFallsBackPastSunPathLimit(t *testing.T) {
	got, err := socketPathFrom("/Users/me/Library/Application Support/SSHManager/run", "/tmp/T", "control.sock")
	if err != nil || got != "/Users/me/Library/Application Support/SSHManager/run/control.sock" {
		t.Fatalf("got %q, %v", got, err)
	}
	long := "/Users/" + strings.Repeat("u", 80) + "/Library/Application Support/SSHManager/run"
	got, err = socketPathFrom(long, "/tmp/T", "control.sock")
	if err != nil || got != "/tmp/T/zish-run/control.sock" {
		t.Fatalf("fallback = %q, %v", got, err)
	}
	if len(filepath.Join("/tmp/T/zish-run", "control.sock")) > maxSocketPath {
		t.Fatal("fallback path itself too long")
	}
	if _, err := socketPathFrom(long, "/"+strings.Repeat("t", 100), "control.sock"); err == nil {
		t.Fatal("expected an error when neither path fits")
	}
	exact := "/" + strings.Repeat("r", maxSocketPath-len("/x.sock")-1)
	if p, err := socketPathFrom(exact, "/tmp/T", "x.sock"); err != nil || len(p) != maxSocketPath || !strings.HasPrefix(p, exact) {
		t.Fatalf("103-byte path rejected: %q (%d), %v", p, len(p), err)
	}
}

func TestEnsurePrivateDirCreatesAndRepairs(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "run")
	if err := ensurePrivateDir(dir); err != nil {
		t.Fatal(err)
	}
	if fi, _ := os.Stat(dir); fi.Mode().Perm() != 0o700 {
		t.Fatalf("mode = %o", fi.Mode().Perm())
	}
	if err := os.Chmod(dir, 0o755); err != nil { //nolint:gosec // test sets a loose mode on purpose
		t.Fatal(err)
	}
	if err := ensurePrivateDir(dir); err != nil {
		t.Fatal(err)
	}
	if fi, _ := os.Stat(dir); fi.Mode().Perm() != 0o700 {
		t.Fatalf("mode not repaired: %o", fi.Mode().Perm())
	}
}

func TestEnsurePrivateDirRejectsSymlinkAndFile(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "elsewhere")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, "run")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if err := ensurePrivateDir(link); !errors.Is(err, ErrUnsafeDir) {
		t.Fatalf("symlink: err = %v", err)
	}
	if fi, _ := os.Stat(target); fi.Mode().Perm() != 0o755 {
		t.Fatalf("symlink target was chmodded: %o", fi.Mode().Perm())
	}
	file := filepath.Join(base, "file")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ensurePrivateDir(file); !errors.Is(err, ErrUnsafeDir) {
		t.Fatalf("file: err = %v", err)
	}
}

type fakeInfo struct {
	mode fs.FileMode
	uid  uint32
}

func (f fakeInfo) Name() string       { return "run" }
func (f fakeInfo) Size() int64        { return 0 }
func (f fakeInfo) Mode() fs.FileMode  { return f.mode }
func (f fakeInfo) ModTime() time.Time { return time.Time{} }
func (f fakeInfo) IsDir() bool        { return f.mode.IsDir() }
func (f fakeInfo) Sys() any           { return &syscall.Stat_t{Uid: f.uid} }

func TestCheckPrivateDirRejectsWrongOwnerAndMode(t *testing.T) {
	me := uint32(os.Getuid()) //nolint:gosec // G115: uid fits
	stat := func(fi fs.FileInfo) func(string) (fs.FileInfo, error) {
		return func(string) (fs.FileInfo, error) { return fi, nil }
	}
	if err := checkPrivateDir("/x", stat(fakeInfo{mode: fs.ModeDir | 0o700, uid: me})); err != nil {
		t.Fatalf("own private dir rejected: %v", err)
	}
	if err := checkPrivateDir("/x", stat(fakeInfo{mode: fs.ModeDir | 0o700, uid: me + 1})); !errors.Is(err, ErrUnsafeDir) {
		t.Fatalf("other owner: err = %v", err)
	}
	if err := checkPrivateDir("/x", stat(fakeInfo{mode: fs.ModeDir | 0o750, uid: me})); !errors.Is(err, ErrUnsafeDir) {
		t.Fatalf("loose mode: err = %v", err)
	}
}

func TestClearDirKeepsTheDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "a", "b"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "f"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ClearDir(dir); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("entries = %v, err = %v", entries, err)
	}
}

func TestLockFileIsExclusive(t *testing.T) {
	path := filepath.Join(t.TempDir(), "instance.lock")
	release, err := lockFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := lockFile(path); !errors.Is(err, ErrInstanceLocked) {
		t.Fatalf("second lock: err = %v", err)
	}
	release()
	again, err := lockFile(path)
	if err != nil {
		t.Fatalf("lock after release: %v", err)
	}
	again()
}
