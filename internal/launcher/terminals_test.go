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
	for _, src := range []string{iTermScript, ghosttyScript} {
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
