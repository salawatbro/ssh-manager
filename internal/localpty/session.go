// Package localpty runs a login shell on a local pseudo-terminal. It exists so
// the app can host a plain terminal tab alongside its SSH sessions: *Session
// satisfies the five-method term.PTY interface, so the whole terminal stack
// (event pump, seq ordering, tabs, splits, find, snippets) drives it unchanged.
//
// Cgo-free on darwin (creack/pty uses ioctl through golang.org/x/sys), which is
// what keeps it inside internal/ — see the gate's CGO_ENABLED=0 build.
package localpty

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path"
	"strings"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

// TermType matches sshx.TermType so a local tab and an SSH tab advertise the
// same terminal to their shells.
const TermType = "xterm-256color"

// defaultShell is the fallback when $SHELL is unset (a detached launch, a
// stripped environment). zsh is the macOS default login shell.
const defaultShell = "/bin/zsh"

// Session is a login shell on a local pty. It satisfies term.PTY, plus the
// optional WaitExitClean the manager's pump asserts for to tell a clean shell
// exit from a dropped session.
type Session struct {
	f     *os.File
	cmd   *exec.Cmd
	shell string

	closeOnce sync.Once
	waitOnce  sync.Once
	waitErr   error
}

// Open starts $SHELL as a login shell on a new pty sized cols x rows. Values
// under 1 fall back to 80x24, the same rule as sshx.OpenSession, so a
// not-yet-measured frontend cannot ask for a zero-sized tty.
func Open(cols, rows int) (*Session, error) {
	if cols < 1 {
		cols = 80
	}
	if rows < 1 {
		rows = 24
	}
	shell := os.Getenv("SHELL")
	if strings.TrimSpace(shell) == "" {
		shell = defaultShell
	}
	// -l makes it a LOGIN shell so the user's rc files run — without it the
	// prompt and PATH are whatever the app process inherited. bash, zsh and
	// fish all accept -l, so this needs no per-shell special case.
	cmd := exec.Command(shell, "-l") //nolint:gosec // G204: shell is $SHELL, the local user's own trusted env var (same trust boundary as agent_unix.go's SSH_AUTH_SOCK), not attacker input.
	cmd.Env = append(os.Environ(), "TERM="+TermType)
	if home, err := os.UserHomeDir(); err == nil {
		cmd.Dir = home
	}
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, err
	}
	return &Session{f: f, cmd: cmd, shell: path.Base(shell)}, nil
}

// Shell is the shell's base name ("zsh", "bash", "fish") — the same vocabulary
// sshx.DetectShell returns, so the frontend picks a snippet the same way for
// local and remote panes.
func (s *Session) Shell() string { return s.shell }

// Read pulls terminal output (blocking). Once the child is gone a pty master
// reports EIO on darwin; the manager's pump only treats io.EOF as "the reader
// finished", so translate it here. Anything else is passed through.
func (s *Session) Read(p []byte) (int, error) {
	n, err := s.f.Read(p)
	if err != nil && (errors.Is(err, syscall.EIO) || errors.Is(err, os.ErrClosed)) {
		return n, io.EOF
	}
	return n, err
}

// Write sends input (keystrokes / paste) to the shell.
func (s *Session) Write(p []byte) (int, error) { return s.f.Write(p) }

// Resize tells the pty its new size (SIGWINCH to the foreground group).
func (s *Session) Resize(cols, rows int) error {
	if cols < 1 {
		cols = 80
	}
	if rows < 1 {
		rows = 24
	}
	return pty.Setsize(s.f, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

// KeepAlive is a no-op: a local shell has no peer that can vanish behind our
// back. Returning nil keeps the manager's dead-peer loop from ever tearing a
// local session down.
func (s *Session) KeepAlive() error { return nil }

// WaitExitClean blocks until the shell exits and reports whether it ended as a
// normal process exit (status 0 OR non-zero — the user's shell simply ended)
// rather than being killed. Mirrors sshx.Session.WaitExitClean, which is the
// behaviour the manager's pump keys the silent pane close off.
func (s *Session) WaitExitClean() bool {
	err := s.wait()
	if err == nil {
		return true
	}
	var ee *exec.ExitError
	return errors.As(err, &ee)
}

// wait reaps the child exactly once. exec.Cmd.Wait errors if called twice, and
// both Close and WaitExitClean can reach it (the manager races reader-EOF
// against user-close), so the result is memoised.
func (s *Session) wait() error {
	s.waitOnce.Do(func() { s.waitErr = s.cmd.Wait() })
	return s.waitErr
}

// Close hangs up the shell and releases the pty, once. Safe to call from
// several goroutines. SIGHUP goes to the whole process GROUP (the negative pid
// — pty.StartWithSize makes the child a session leader, so its pid is the group
// id) so background jobs die with the shell instead of being orphaned.
func (s *Session) Close() error {
	s.closeOnce.Do(func() {
		if s.cmd.Process != nil {
			_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGHUP)
		}
		_ = s.f.Close()
		// Reap in the background: Close must not block the manager's shutdown
		// path on a shell that ignores SIGHUP.
		go func() { _ = s.wait() }()
	})
	return nil
}
