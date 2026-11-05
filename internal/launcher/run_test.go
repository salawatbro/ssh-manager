package launcher

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestExecRunner(t *testing.T) {
	dir := t.TempDir()
	var r ExecRunner
	if err := r.Run(Attempt{Argv: []string{writeExe(t, dir, "ok", "exit 0\n")}, Wait: 5 * time.Second}); err != nil {
		t.Fatalf("ok: %v", err)
	}
	err := r.Run(Attempt{Argv: []string{writeExe(t, dir, "fail", "echo boom >&2; exit 3\n")}, Wait: 5 * time.Second})
	if err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("fail: %v", err)
	}
	err = r.Run(Attempt{Argv: []string{writeExe(t, dir, "denied", "echo 'execution error: Not authorized to send Apple events to iTerm. (-1743)' >&2; exit 1\n")}, Wait: 5 * time.Second})
	if !errors.Is(err, ErrAutomationDenied) {
		t.Fatalf("denied: %v", err)
	}
	start := time.Now()
	err = r.Run(Attempt{Argv: []string{writeExe(t, dir, "slow", "sleep 5\n")}, Wait: 200 * time.Millisecond})
	if err == nil || time.Since(start) > 3*time.Second {
		t.Fatalf("slow: %v after %v", err, time.Since(start))
	}
	start = time.Now()
	if err := r.Run(Attempt{Argv: []string{writeExe(t, dir, "forks", "sleep 5 &\nexit 0\n")}, Wait: 4 * time.Second}); err != nil || time.Since(start) > 3*time.Second {
		t.Fatalf("a child holding the output: %v after %v", err, time.Since(start))
	}
	if err := r.Run(Attempt{Argv: []string{writeExe(t, dir, "gui", "sleep 1\n")}, Wait: 100 * time.Millisecond, KeepRunning: true}); err != nil {
		t.Fatalf("keep running: %v", err)
	}
	if err := r.Run(Attempt{Argv: []string{writeExe(t, dir, "guifail", "exit 4\n")}, Wait: 2 * time.Second, KeepRunning: true}); err == nil {
		t.Fatal("keep running: early failure not reported")
	}
	if err := r.Run(Attempt{Argv: []string{"/nonexistent/x"}, Wait: time.Second}); err == nil {
		t.Fatal("missing binary accepted")
	}
}
