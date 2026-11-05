package launcher

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ErrAutomationDenied reports macOS refusing Zish's Apple Events to the
// terminal (osascript error -1743).
var ErrAutomationDenied = errors.New("automation permission denied")

// Runner runs one open attempt.
type Runner interface {
	Run(a Attempt) error
}

// ExecRunner runs attempts as child processes with /dev/null stdin, no
// shell, and a bounded capture of their error output.
type ExecRunner struct{}

const maxCapture = 4 << 10

type capBuffer struct{ bytes.Buffer }

func (c *capBuffer) Write(p []byte) (int, error) {
	if room := maxCapture - c.Len(); room > 0 {
		c.Buffer.Write(p[:min(len(p), room)])
	}
	return len(p), nil
}

// Run starts a.Argv and waits up to a.Wait.
func (ExecRunner) Run(a Attempt) error {
	if len(a.Argv) == 0 {
		return errors.New("empty command")
	}
	cmd := exec.Command(a.Argv[0], a.Argv[1:]...) //nolint:gosec // G204: argv built by OpenCommands/CustomCommand, never through a shell
	var out capBuffer
	if !a.KeepRunning {
		cmd.Stdout, cmd.Stderr = &out, &out
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err == nil {
			return nil
		}
		text := strings.TrimSpace(out.String())
		if strings.Contains(text, "-1743") {
			return ErrAutomationDenied
		}
		return fmt.Errorf("%s: %w: %s", filepath.Base(a.Argv[0]), err, text)
	case <-time.After(a.Wait):
		if a.KeepRunning {
			return nil
		}
		_ = cmd.Process.Kill()
		<-done
		return fmt.Errorf("%s did not finish within %s", filepath.Base(a.Argv[0]), a.Wait)
	}
}
