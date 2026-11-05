package launcher

import (
	"errors"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// Terminal is one supported terminal app.
type Terminal struct {
	ID              string
	Name            string
	BundleID        string
	SupportsTab     bool
	NeedsAutomation bool
	Note            string
}

// Catalog lists the supported terminal apps, Terminal.app first. Custom is
// handled separately (CustomCommand).
var Catalog = []Terminal{
	{ID: domain.TerminalApple, Name: "Terminal", BundleID: "com.apple.Terminal"},
	{ID: domain.TerminalITerm2, Name: "iTerm2", BundleID: "com.googlecode.iterm2", SupportsTab: true, NeedsAutomation: true},
	{ID: domain.TerminalGhostty, Name: "Ghostty", BundleID: "com.mitchellh.ghostty", SupportsTab: true, NeedsAutomation: true,
		Note: "Tabs need Ghostty 1.3 or later."},
	{ID: domain.TerminalWezTerm, Name: "WezTerm", BundleID: "com.github.wez.wezterm", SupportsTab: true},
	{ID: domain.TerminalKitty, Name: "kitty", BundleID: "net.kovidgoyal.kitty"},
	{ID: domain.TerminalAlacritty, Name: "Alacritty", BundleID: "org.alacritty"},
}

// Lookup returns the catalog entry for id.
func Lookup(id string) (Terminal, bool) {
	for _, t := range Catalog {
		if t.ID == id {
			return t, true
		}
	}
	return Terminal{}, false
}

// AppInfo is an installed app's bundle path and CFBundleShortVersionString.
type AppInfo struct {
	Path    string
	Version string
}

// AppLocator finds installed apps by bundle id (LaunchServices on macOS).
type AppLocator interface {
	Locate(bundleID string) (AppInfo, bool)
}

// Attempt is one command to try; the first that succeeds wins. KeepRunning
// treats a process still alive at Wait as started, and leaves it running.
type Attempt struct {
	Argv        []string
	Wait        time.Duration
	KeepRunning bool
}

const (
	openWait = 120 * time.Second // a TCC prompt blocks osascript until answered
	cliWait  = 10 * time.Second
	openPath = "/usr/bin/open"
	osaPath  = "/usr/bin/osascript"
)

// iTermScript and ghosttyScript are constant AppleScript sources. The launch
// script path and "window"/"tab" arrive as osascript arguments (argv), never
// spliced into the source.
const iTermScript = `on run argv
	set p to item 1 of argv
	tell application id "com.googlecode.iterm2"
		activate
		if (item 2 of argv) is "tab" and (count of windows) > 0 then
			tell current window to create tab with default profile command p
		else
			create window with default profile command p
		end if
	end tell
end run`

// iTermStackScript opens one stack step: item 2 of argv is "window", "tab" or
// "split" (beside the current pane). Like iTermScript, nothing is spliced in.
const iTermStackScript = `on run argv
	set p to item 1 of argv
	set zishPlace to item 2 of argv
	tell application id "com.googlecode.iterm2"
		activate
		if (count of windows) is 0 or zishPlace is "window" then
			create window with default profile command p
		else if zishPlace is "split" then
			tell current session of current window to split vertically with default profile command p
		else
			tell current window to create tab with default profile command p
		end if
	end tell
end run`

const ghosttyScript = `on run argv
	set p to item 1 of argv
	tell application id "com.mitchellh.ghostty"
		activate
		set cfg to new surface configuration
		set command of cfg to p
		if (item 2 of argv) is "tab" and (count of windows) > 0 then
			new tab in front window with configuration cfg
		else
			new window with configuration cfg
		end if
	end tell
end run`

// OpenCommands lists the commands that open script in terminal id, in the
// order to try them.
func OpenCommands(id string, app AppInfo, script string, inTab bool) ([]Attempt, error) {
	t, ok := Lookup(id)
	if !ok {
		return nil, errors.New("unknown terminal " + id)
	}
	mode := "window"
	if inTab && t.SupportsTab {
		mode = "tab"
	}
	open := func(args ...string) Attempt {
		return Attempt{Argv: append([]string{openPath}, args...), Wait: openWait}
	}
	bin := func(name string) string { return filepath.Join(app.Path, "Contents", "MacOS", name) }

	switch id {
	case domain.TerminalApple:
		return []Attempt{open("-b", t.BundleID, script)}, nil
	case domain.TerminalITerm2:
		return []Attempt{
			{Argv: []string{osaPath, "-e", iTermScript, script, mode}, Wait: openWait},
			open("-b", t.BundleID, script),
		}, nil
	case domain.TerminalGhostty:
		fallback := open("-n", "-b", t.BundleID, "--args", "-e", script)
		if !versionAtLeast(app.Version, 1, 3) {
			return []Attempt{fallback}, nil
		}
		return []Attempt{{Argv: []string{osaPath, "-e", ghosttyScript, script, mode}, Wait: openWait}, fallback}, nil
	case domain.TerminalWezTerm:
		window := open("-n", "-b", t.BundleID, "--args", "start", "--", script)
		if mode == "tab" && app.Path != "" {
			return []Attempt{{Argv: []string{bin("wezterm"), "cli", "spawn", "--", script}, Wait: cliWait}, window}, nil
		}
		return []Attempt{window}, nil
	case domain.TerminalKitty:
		return []Attempt{open("-n", "-b", t.BundleID, "--args", "--single-instance", "--instance-group", "zish", script)}, nil
	case domain.TerminalAlacritty:
		window := open("-n", "-b", t.BundleID, "--args", "-e", script)
		if app.Path != "" {
			return []Attempt{{Argv: []string{bin("alacritty"), "msg", "create-window", "-e", script}, Wait: cliWait}, window}, nil
		}
		return []Attempt{window}, nil
	}
	return nil, errors.New("no open command for " + id)
}

// versionAtLeast reports whether a "major.minor[.patch]" version is at least
// major.minor. Unparseable versions count as older.
func versionAtLeast(v string, major, minor int) bool {
	parts := strings.SplitN(v, ".", 3)
	if len(parts) < 2 {
		return false
	}
	ma, err1 := strconv.Atoi(parts[0])
	mi, err2 := strconv.Atoi(strings.TrimRightFunc(parts[1], func(r rune) bool { return r < '0' || r > '9' }))
	if err1 != nil || err2 != nil {
		return false
	}
	return ma > major || (ma == major && mi >= minor)
}

// TabSupported reports whether the installed app can open a tab.
func TabSupported(t Terminal, app AppInfo) bool {
	if t.ID == domain.TerminalGhostty {
		return versionAtLeast(app.Version, 1, 3)
	}
	return t.SupportsTab
}

// StepMode is how a stack step opens: "window", "tab" or "split". A split
// needs iTerm2 and a pane opened earlier by the same stack; tabs need an app
// that has them. Everything else falls back to a tab, then a window.
func StepMode(termID string, tabs bool, placement domain.Placement, first bool) string {
	switch {
	case placement == domain.PlaceWindow:
		return "window"
	case placement == domain.PlaceSplit && termID == domain.TerminalITerm2 && !first:
		return "split"
	case tabs:
		return "tab"
	}
	return "window"
}

// StackCommands is OpenCommands for a stack step, mode from StepMode. iTerm2
// gets the stack script, which can split; if Automation is refused it opens a
// window like any other launch.
func StackCommands(id string, app AppInfo, script, mode string) ([]Attempt, error) {
	if id != domain.TerminalITerm2 {
		return OpenCommands(id, app, script, mode != "window")
	}
	return []Attempt{
		{Argv: []string{osaPath, "-e", iTermStackScript, script, mode}, Wait: openWait},
		{Argv: []string{openPath, "-b", "com.googlecode.iterm2", script}, Wait: openWait},
	}, nil
}
