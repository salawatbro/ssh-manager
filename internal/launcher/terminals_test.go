package launcher

import (
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

const scriptPath = "/Users/me/Library/Caches/SSHManager/launch/ab12/connect.command"

func argvs(as []Attempt) [][]string {
	out := make([][]string, len(as))
	for i, a := range as {
		out[i] = a.Argv
	}
	return out
}

func TestOpenCommands(t *testing.T) {
	app := AppInfo{Path: "/Applications/X.app", Version: "1.3.0"}
	osa := func(src, mode string) []string { return []string{osaPath, "-e", src, scriptPath, mode} }
	cases := []struct {
		id    string
		app   AppInfo
		inTab bool
		want  [][]string
	}{
		{domain.TerminalApple, app, false, [][]string{{openPath, "-b", "com.apple.Terminal", scriptPath}}},
		{domain.TerminalApple, app, true, [][]string{{openPath, "-b", "com.apple.Terminal", scriptPath}}},
		{domain.TerminalITerm2, app, false, [][]string{osa(iTermScript, "window"), {openPath, "-b", "com.googlecode.iterm2", scriptPath}}},
		{domain.TerminalITerm2, app, true, [][]string{osa(iTermScript, "tab"), {openPath, "-b", "com.googlecode.iterm2", scriptPath}}},
		{domain.TerminalGhostty, app, true, [][]string{osa(ghosttyScript, "tab"), {openPath, "-n", "-b", "com.mitchellh.ghostty", "--args", "-e", scriptPath}}},
		{domain.TerminalGhostty, AppInfo{Version: "1.2.3"}, true, [][]string{{openPath, "-n", "-b", "com.mitchellh.ghostty", "--args", "-e", scriptPath}}},
		{domain.TerminalGhostty, AppInfo{Version: ""}, false, [][]string{{openPath, "-n", "-b", "com.mitchellh.ghostty", "--args", "-e", scriptPath}}},
		{domain.TerminalGhostty, AppInfo{Version: "1.10"}, false, [][]string{osa(ghosttyScript, "window"), {openPath, "-n", "-b", "com.mitchellh.ghostty", "--args", "-e", scriptPath}}},
		{domain.TerminalWezTerm, app, false, [][]string{{openPath, "-n", "-b", "com.github.wez.wezterm", "--args", "start", "--", scriptPath}}},
		{domain.TerminalWezTerm, app, true, [][]string{{"/Applications/X.app/Contents/MacOS/wezterm", "cli", "spawn", "--", scriptPath}, {openPath, "-n", "-b", "com.github.wez.wezterm", "--args", "start", "--", scriptPath}}},
		{domain.TerminalKitty, app, true, [][]string{{openPath, "-n", "-b", "net.kovidgoyal.kitty", "--args", "--single-instance", "--instance-group", "zish", scriptPath}}},
		{domain.TerminalAlacritty, app, false, [][]string{{"/Applications/X.app/Contents/MacOS/alacritty", "msg", "create-window", "-e", scriptPath}, {openPath, "-n", "-b", "org.alacritty", "--args", "-e", scriptPath}}},
		{domain.TerminalAlacritty, AppInfo{}, false, [][]string{{openPath, "-n", "-b", "org.alacritty", "--args", "-e", scriptPath}}},
	}
	for _, c := range cases {
		got, err := OpenCommands(c.id, c.app, scriptPath, c.inTab)
		if err != nil {
			t.Fatalf("%s: %v", c.id, err)
		}
		if g := argvs(got); !slices.EqualFunc(g, c.want, slices.Equal[[]string]) {
			t.Errorf("%s tab=%v app=%+v:\n got %q\nwant %q", c.id, c.inTab, c.app, g, c.want)
		}
		for _, a := range got {
			if a.Wait <= 0 || a.KeepRunning {
				t.Errorf("%s: attempt %q wait=%v keep=%v", c.id, a.Argv[0], a.Wait, a.KeepRunning)
			}
		}
	}
	if _, err := OpenCommands("warp", app, scriptPath, false); err == nil {
		t.Fatal("unknown terminal accepted")
	}
}

// The AppleScript sources are constants: the script path only ever travels
// as an osascript argument.
func TestAppleScriptSourcesAreConstant(t *testing.T) {
	for _, src := range []string{iTermScript, iTermStackScript, ghosttyScript} {
		if strings.Contains(src, scriptPath) || strings.Contains(src, "connect.command") || strings.Contains(src, "%") {
			t.Fatalf("script source carries data:\n%s", src)
		}
		if !strings.Contains(src, "item 1 of argv") || !strings.Contains(src, "item 2 of argv") {
			t.Fatalf("script source does not read argv:\n%s", src)
		}
	}
	hostile := "/tmp/a\" & do shell script \"id"
	got, _ := OpenCommands(domain.TerminalITerm2, AppInfo{}, hostile, false)
	if got[0].Argv[2] != iTermScript || got[0].Argv[3] != hostile {
		t.Fatalf("argv = %q", got[0].Argv)
	}
}

func TestCatalogMatchesSettingsIDs(t *testing.T) {
	for _, term := range Catalog {
		if !slices.Contains(domain.TerminalIDs, term.ID) {
			t.Errorf("catalog id %q is not a settings id", term.ID)
		}
	}
	if len(Catalog)+1 != len(domain.TerminalIDs) {
		t.Errorf("catalog has %d entries, settings %d ids (plus custom)", len(Catalog), len(domain.TerminalIDs))
	}
}

func TestVersionAtLeast(t *testing.T) {
	cases := map[string]bool{"1.3": true, "1.3.0": true, "1.3.1": true, "1.10.0": true, "2.0": true, "1.2.9": false, "1": false, "": false, "tip": false, "1.3-beta": true, "0.9": false}
	for v, want := range cases {
		if got := versionAtLeast(v, 1, 3); got != want {
			t.Errorf("versionAtLeast(%q) = %v", v, got)
		}
	}
}

func TestStepMode(t *testing.T) {
	cases := []struct {
		term      string
		tabs      bool
		placement domain.Placement
		first     bool
		want      string
	}{
		{domain.TerminalITerm2, true, domain.PlaceSplit, false, "split"},
		{domain.TerminalITerm2, true, domain.PlaceSplit, true, "tab"},
		{domain.TerminalITerm2, true, domain.PlaceTab, true, "tab"},
		{domain.TerminalITerm2, true, domain.PlaceWindow, false, "window"},
		{domain.TerminalGhostty, true, domain.PlaceSplit, false, "tab"},
		{domain.TerminalGhostty, false, domain.PlaceTab, false, "window"},
		{domain.TerminalApple, false, domain.PlaceSplit, false, "window"},
		{domain.TerminalWezTerm, true, domain.PlaceWindow, false, "window"},
	}
	for _, c := range cases {
		if got := StepMode(c.term, c.tabs, c.placement, c.first); got != c.want {
			t.Errorf("StepMode(%s, tabs=%v, %s, first=%v) = %s, want %s", c.term, c.tabs, c.placement, c.first, got, c.want)
		}
	}
}

// The split script is a constant: the launch script path and the placement
// are osascript arguments, never part of the source.
func TestStackCommands(t *testing.T) {
	app := AppInfo{Path: "/Applications/iTerm.app", Version: "3.5"}
	for _, mode := range []string{"window", "tab", "split"} {
		got, err := StackCommands(domain.TerminalITerm2, app, scriptPath, mode)
		if err != nil {
			t.Fatal(err)
		}
		want := [][]string{{osaPath, "-e", iTermStackScript, scriptPath, mode}, {openPath, "-b", "com.googlecode.iterm2", scriptPath}}
		if g := argvs(got); !slices.EqualFunc(g, want, slices.Equal[[]string]) {
			t.Errorf("%s: %q", mode, g)
		}
	}
	if strings.Contains(iTermStackScript, "connect.command") || !strings.Contains(iTermStackScript, "item 2 of argv") ||
		!strings.Contains(iTermStackScript, "split vertically with default profile command p") {
		t.Fatal("iTermStackScript must take its values from argv")
	}
	got, err := StackCommands(domain.TerminalGhostty, AppInfo{Version: "1.3"}, scriptPath, "tab")
	if err != nil || len(got) != 2 || got[0].Argv[2] != ghosttyScript || got[0].Argv[4] != "tab" {
		t.Fatalf("ghostty tab = %q, %v", argvs(got), err)
	}
	got, _ = StackCommands(domain.TerminalGhostty, AppInfo{Version: "1.3"}, scriptPath, "window")
	if got[0].Argv[4] != "window" {
		t.Fatalf("ghostty window = %q", argvs(got))
	}
}
