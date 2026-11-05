package launcher

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

var token = strings.Repeat("0123456789abcdef", 4)

func TestScriptExactBytes(t *testing.T) {
	exe := "/Applications/Zish It's $HOME.app/Contents/MacOS/sshmgr"
	got, err := Script(exe, token)
	if err != nil {
		t.Fatal(err)
	}
	want := `#!/bin/sh
rm -f -- "$0"
'/Applications/Zish It'\''s $HOME.app/Contents/MacOS/sshmgr' --connect ` + token + `
status=$?
if [ "$status" -eq 255 ]; then
  printf '\n[Zish] ssh exited with an error. Press Return to close this window.\n'
  read -r _
fi
exit "$status"
`
	if string(got) != want {
		t.Fatalf("script =\n%s\nwant\n%s", got, want)
	}
	cmd := exec.Command("/bin/sh", "-n")
	cmd.Stdin = bytes.NewReader(got)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("sh -n: %v %s", err, out)
	}
}

func TestScriptRejectsBadInput(t *testing.T) {
	for _, tok := range []string{"", "deadbeef", strings.ToUpper(token), token + "0", strings.Repeat("g", 64), token[:63] + ";"} {
		if _, err := Script("/bin/x", tok); err == nil {
			t.Errorf("Script accepted token %q", tok)
		}
	}
	for _, exe := range []string{"relative/sshmgr", "/bin/x\nrm -rf ~", ""} {
		if _, err := Script(exe, token); err == nil {
			t.Errorf("Script accepted exe %q", exe)
		}
	}
}

func writeExe(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body), 0o700); err != nil { //nolint:gosec // test stub must be executable
		t.Fatal(err)
	}
	return p
}

// Run the real script with a stub executable: it deletes itself, passes the
// token, and pauses only on exit 255.
func TestScriptRunsAndPausesOn255(t *testing.T) {
	dir := t.TempDir()
	for _, c := range []struct {
		code  int
		pause bool
	}{{255, true}, {1, false}, {0, false}} {
		stub := writeExe(t, dir, "stub's $exe", `echo "args:$*"; exit `+strconv.Itoa(c.code)+"\n")
		body, err := Script(stub, token)
		if err != nil {
			t.Fatal(err)
		}
		script := filepath.Join(dir, "connect.command")
		if err := os.WriteFile(script, body, 0o700); err != nil { //nolint:gosec // launch script must be executable
			t.Fatal(err)
		}
		cmd := exec.Command(script)
		cmd.Stdin = strings.NewReader("\n")
		out, _ := cmd.CombinedOutput()
		if cmd.ProcessState.ExitCode() != c.code {
			t.Fatalf("exit %d, want %d", cmd.ProcessState.ExitCode(), c.code)
		}
		if !strings.Contains(string(out), "args:--connect "+token) {
			t.Fatalf("stub got %q", out)
		}
		if paused := strings.Contains(string(out), "Press Return to close"); paused != c.pause {
			t.Fatalf("exit %d: paused=%v", c.code, paused)
		}
		if _, err := os.Stat(script); !os.IsNotExist(err) {
			t.Fatal("script did not delete itself")
		}
	}
}
