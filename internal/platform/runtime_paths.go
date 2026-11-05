package platform

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

// maxSocketPath is the usable sun_path length on macOS: 104 bytes including
// the terminating NUL.
const maxSocketPath = 103

// tmpFolder names the per-user folder under os.TempDir() that holds the
// fallbacks for a LaunchDir or socket path that cannot be used.
const tmpFolder = "uz.salawat.sshmgr"

// shellSafePathRe is the character set a path may use when it ends up inside
// a shell string: ssh's ProxyJump command line and the line Terminal.app types
// to run a .command file.
var shellSafePathRe = regexp.MustCompile(`^/[A-Za-z0-9/._+-]+$`)

// ErrUnsafeDir reports a runtime directory that is not a private, real
// directory owned by the current user.
var ErrUnsafeDir = errors.New("runtime directory is not private")

// ErrInstanceLocked reports that another Zish process holds instance.lock.
var ErrInstanceLocked = errors.New("another Zish instance is running")

// IsShellSafePath reports whether p can be pasted into a shell command
// unquoted without any character being interpreted.
func IsShellSafePath(p string) bool {
	return shellSafePathRe.MatchString(p)
}

// RunDir holds instance.lock, the control socket and the askpass symlink.
func RunDir() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "run"), nil
}

// EnsureRunDir creates RunDir as a private directory and returns its path.
func EnsureRunDir() (string, error) {
	dir, err := RunDir()
	if err != nil {
		return "", err
	}
	if err := ensurePrivateDir(dir); err != nil {
		return "", err
	}
	return dir, nil
}

// PubKeyDir holds the agent keys' public-key files, which ssh uses only to
// pick one agent key (IdentityFile).
func PubKeyDir() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "pubkeys"), nil
}

// EnsurePubKeyDir creates PubKeyDir as a private directory and returns it.
func EnsurePubKeyDir() (string, error) {
	dir, err := PubKeyDir()
	if err != nil {
		return "", err
	}
	if err := ensurePrivateDir(dir); err != nil {
		return "", err
	}
	return dir, nil
}

// CacheDir is the app's folder under ~/Library/Caches. It holds nothing but
// the per-launch scripts, so Uninstall removes it whole.
func CacheDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("cannot resolve the OS cache directory: %w", err)
	}
	return filepath.Join(base, appFolder), nil
}

// LaunchDir reports where per-launch scripts go. It does not touch disk.
func LaunchDir() (string, error) {
	cache, err := CacheDir()
	if err != nil {
		return "", err
	}
	return launchDirFrom(cache, os.TempDir())
}

func launchDirFrom(cacheDir, tmpDir string) (string, error) {
	if dir := filepath.Join(cacheDir, "launch"); IsShellSafePath(dir) {
		return dir, nil
	}
	if dir := filepath.Join(tmpDir, tmpFolder, "launch"); IsShellSafePath(dir) {
		return dir, nil
	}
	return "", fmt.Errorf("%w: no shell-safe folder for launch scripts", ErrUnsafeDir)
}

// EnsureLaunchDir creates LaunchDir (and its private parent) and returns it.
func EnsureLaunchDir() (string, error) {
	dir, err := LaunchDir()
	if err != nil {
		return "", err
	}
	if err := ensurePrivateDir(filepath.Dir(dir)); err != nil {
		return "", err
	}
	if err := ensurePrivateDir(dir); err != nil {
		return "", err
	}
	return dir, nil
}

// SocketPath reports where the socket called name lives: in RunDir when the
// path fits sun_path, else under a private temp folder. It does not touch
// disk; EnsureSocketDir prepares the folder.
func SocketPath(name string) (string, error) {
	run, err := RunDir()
	if err != nil {
		return "", err
	}
	return socketPathFrom(run, os.TempDir(), name)
}

func socketPathFrom(runDir, tmpDir, name string) (string, error) {
	if p := filepath.Join(runDir, name); len(p) <= maxSocketPath {
		return p, nil
	}
	if p := filepath.Join(tmpDir, "zish-run", name); len(p) <= maxSocketPath {
		return p, nil
	}
	return "", fmt.Errorf("no socket path for %s fits in %d bytes", name, maxSocketPath)
}

// EnsureSocketDir makes the folder holding socketPath a private directory.
func EnsureSocketDir(socketPath string) error {
	return ensurePrivateDir(filepath.Dir(socketPath))
}

// ClearDir removes every entry inside dir, leaving dir itself.
func ClearDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var errs []error
	for _, e := range entries {
		errs = append(errs, os.RemoveAll(filepath.Join(dir, e.Name())))
	}
	return errors.Join(errs...)
}

// LockInstance takes the single-instance lock in RunDir. The lock dies with
// the process, so a crash never leaves it held.
func LockInstance() (release func(), err error) {
	dir, err := EnsureRunDir()
	if err != nil {
		return nil, err
	}
	return lockFile(filepath.Join(dir, "instance.lock"))
}

// ensurePrivateDir creates path (mode 0700) if missing, repairs its mode, and
// then refuses it unless it is a real directory owned by this user.
func ensurePrivateDir(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	fi, err := os.Lstat(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		if err := os.Mkdir(path, 0o700); err != nil && !errors.Is(err, fs.ErrExist) {
			return err
		}
	case err != nil:
		return err
	case !fi.IsDir():
		return fmt.Errorf("%w: %s is not a directory", ErrUnsafeDir, path)
	}
	// Directories need the execute bit, so 0700 is the private mode here.
	if err := os.Chmod(path, 0o700); err != nil { //nolint:gosec // G302: directory, see EnsureDataDir
		return fmt.Errorf("%w: cannot set 0700 on %s: %v", ErrUnsafeDir, path, err)
	}
	return checkPrivateDir(path, os.Lstat)
}

func checkPrivateDir(path string, lstat func(string) (fs.FileInfo, error)) error {
	fi, err := lstat(path)
	if err != nil {
		return err
	}
	if fi.Mode()&fs.ModeSymlink != 0 || !fi.IsDir() {
		return fmt.Errorf("%w: %s is not a real directory", ErrUnsafeDir, path)
	}
	if fi.Mode().Perm() != 0o700 {
		return fmt.Errorf("%w: %s has mode %o", ErrUnsafeDir, path, fi.Mode().Perm())
	}
	if !ownedByMe(fi) {
		return fmt.Errorf("%w: %s is owned by another user", ErrUnsafeDir, path)
	}
	return nil
}
