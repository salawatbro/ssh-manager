package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"

	"github.com/wailsapp/wails/v3/pkg/application"
	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/service"
	"github.com/salawat/sshmgr/internal/store"
)

// restarting lets a restore's quit skip the running-tunnels question.
var restarting atomic.Bool

func newBackupService(db *gorm.DB, dbPath string, servers *store.ServerRepo, keys *store.AgentKeyRepo,
	settings *store.SettingsRepo, kr secret.Store, gate *service.LockGate, bio service.Biometrics,
) *service.BackupService {
	home, _ := os.UserHomeDir()
	host, _ := os.Hostname()
	s := service.NewBackupService(service.BackupDeps{
		DB: db, DBPath: dbPath, Home: home, Servers: servers, Keys: keys, Settings: settings,
		Secret: kr, Gate: gate, Bio: bio, Hostname: host, App: bundleVersion(),
	})
	service.SetBackupRuntime(s, func(st service.BackupStatus) {
		if app := application.Get(); app != nil {
			app.Event.Emit("backup:status", st)
		}
	}, restartApp)
	return s
}

// The script waits for this process to exit, then opens the bundle again.
// Both arrive as arguments; nothing is put into the script text.
const relaunchScript = `while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open "$2"`

// restartApp quits Zish and opens it again once this process is gone, so the
// next start can swap in a restored database. Outside an app bundle (wails3
// dev) it only quits.
func restartApp() {
	restarting.Store(true)
	if bundle := appBundlePath(); bundle != "" {
		cmd := exec.Command("/bin/sh", "-c", relaunchScript, "zish-relaunch", strconv.Itoa(os.Getpid()), bundle) //nolint:gosec // constant script, values as arguments
		cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		_ = cmd.Start()
	}
	application.InvokeAsync(func() { application.Get().Quit() })
}

// appBundlePath is the .app this executable runs from, or "".
func appBundlePath() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	i := strings.LastIndex(exe, ".app/Contents/MacOS/")
	if i < 0 {
		return ""
	}
	return exe[:i+len(".app")]
}

var shortVersion = regexp.MustCompile(`<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>`)

// bundleVersion reads the app version from the bundle's Info.plist; it only
// labels backups, so "" is fine outside a bundle.
func bundleVersion() string {
	bundle := appBundlePath()
	if bundle == "" {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(bundle, "Contents", "Info.plist")) //nolint:gosec // our own bundle
	if err != nil {
		return ""
	}
	if m := shortVersion.FindSubmatch(b); m != nil {
		return string(m[1])
	}
	return ""
}
