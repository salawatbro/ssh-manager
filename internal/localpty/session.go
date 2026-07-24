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
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/creack/pty"
)

// TermType matches sshx.TermType so a local tab and an SSH tab advertise the
// same terminal to their shells.
const TermType = "xterm-256color"

// defaultShell is the fallback when $SHELL is unset (a detached launch, a
// stripped environment). zsh is the macOS default login shell.
const defaultShell = "/bin/zsh"

// maxPtyDim is the largest column/row count a pty.Winsize field can hold
// (its Cols/Rows are uint16). Values above this are clamped rather than
// silently truncated by the uint16 conversion (e.g. 65616 wrapping to 80).
const maxPtyDim = 65535

// reapGrace is how long Close waits for a shell to act on SIGHUP before
// escalating to SIGKILL. Most shells tear down within milliseconds; this
// only matters for one that traps or ignores SIGHUP outright.
const reapGrace = 2 * time.Second

// Session is a login shell on a local pty. It satisfies term.PTY, plus the
// optional WaitExitClean the manager's pump asserts for to tell a clean shell
// exit from a dropped session.
type Session struct {
	f     *os.File
	cmd   *exec.Cmd
	shell string

	closeOnce sync.Once
	closeErr  error

	waitOnce sync.Once
	waitErr  error
	// reaped is set by wait() once cmd.Wait has returned. It guards the
	// syscall.Kill calls in Close and reapWithEscalation: syscall.Kill
	// bypasses Go's os.Process bookkeeping, so nothing else stops it from
	// signalling a pid the OS has already recycled as an unrelated process
	// group leader. A reaped child has nothing left to signal, so skipping
	// the kill in that case is lossless.
	reaped atomic.Bool
}

// clampDim reduces v to the [1, maxPtyDim] range a pty.Winsize field can
// hold, falling back to fallback when v is not yet a measured value (<1).
func clampDim(v, fallback int) uint16 {
	if v < 1 {
		v = fallback
	} else if v > maxPtyDim {
		v = maxPtyDim
	}
	return uint16(v)
}

// normalizeShellName reduces a $SHELL value to its basename, trimming
// surrounding whitespace and a leading '-' (the login-shell argv[0]
// convention). This mirrors sshx/probe.go's classifyShell in normalisation
// only, not in classification: classifyShell collapses the result into a
// closed Shell enum (bash/zsh/fish/unknown), while this returns whatever
// basename it finds — "ls" stays "ls". Consumers that only recognise
// bash/zsh/fish (frontend snippetFor, the status-bar label) already treat
// anything else as unrecognised, so the two agree on every case that matters.
func normalizeShellName(raw string) string {
	return strings.TrimPrefix(filepath.Base(strings.TrimSpace(raw)), "-")
}

// Open starts $SHELL as a login shell on a new pty sized cols x rows. Values
// under 1 fall back to 80x24, the same rule as sshx.OpenSession, so a
// not-yet-measured frontend cannot ask for a zero-sized tty; values above the
// uint16 range are clamped rather than silently truncated.
func Open(cols, rows int) (*Session, error) {
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
	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: clampDim(cols, 80), Rows: clampDim(rows, 24)})
	if err != nil {
		return nil, err
	}
	return &Session{f: f, cmd: cmd, shell: normalizeShellName(shell)}, nil
}

// Shell returns $SHELL reduced to its basename ("zsh", "bash", "fish", or
// whatever the login shell binary is actually called) — see
// normalizeShellName. It is not restricted to a closed vocabulary: an
// uncommon $SHELL comes back as its own basename rather than being mapped to
// an "unknown" placeholder. This value flows to the frontend's snippetFor and
// the status-bar shell label, both of which already treat anything outside
// bash/zsh/fish as unrecognised, so this is enough for a local pane to agree
// with a remote pane's sshx.DetectShell on the common cases.
func (s *Session) Shell() string { return s.shell }

// Read pulls terminal output (blocking). Measured on darwin/arm64
// (go1.26.5): once the shell exits, a read from the pty master returns a
// plain io.EOF (n=0) — no translation needed there. EIO is what Linux's pty
// layer reports in the same situation instead, so that branch is kept as
// forward defence in case this package ever needs to run there, even though
// nothing in the current build targets it. Nothing here requires the EOF
// translation for correctness, either: term.Manager's read loop tears the
// pane down on any non-nil error, not only io.EOF. Anything else — including
// a use-after-close os.ErrClosed — is passed through unchanged so a real bug
// surfaces as itself instead of looking like a normal shell exit.
func (s *Session) Read(p []byte) (int, error) {
	n, err := s.f.Read(p)
	if err != nil && errors.Is(err, syscall.EIO) {
		return n, io.EOF
	}
	return n, err
}

// Write sends input (keystrokes / paste) to the shell.
func (s *Session) Write(p []byte) (int, error) { return s.f.Write(p) }

// Resize tells the pty its new size (SIGWINCH to the foreground group).
// Values under 1 fall back to 80x24; values above the uint16 range are
// clamped instead of silently truncated.
func (s *Session) Resize(cols, rows int) error {
	return pty.Setsize(s.f, &pty.Winsize{Cols: clampDim(cols, 80), Rows: clampDim(rows, 24)})
}

// KeepAlive is a no-op: a local shell has no peer that can vanish behind our
// back. Returning nil keeps the manager's dead-peer loop from ever tearing a
// local session down.
func (s *Session) KeepAlive() error { return nil }

// WaitExitClean blocks until the shell exits and reports whether that exit
// was clean: a shell that EXITED is clean whether its status was zero or
// non-zero (the user's shell simply ended); a shell that was SIGNALLED
// (killed, OOM-reaped, crashed) is not. This deliberately diverges from
// sshx.Session.WaitExitClean, which treats a signalled remote exit as clean
// too — golang.org/x/crypto/ssh returns the same *ssh.ExitError for an
// "exit-signal" as for a non-zero exit-status, and distinguishing them there
// would mean parsing the wire message by hand for little benefit. Locally we
// have the real *os.ProcessState and can tell the difference cheaply, and a
// shell nobody asked to end (killed, OOM) should leave the manager's
// "Connection lost" notice rather than closing the pane silently.
func (s *Session) WaitExitClean() bool {
	err := s.wait()
	if err == nil {
		return true
	}
	var ee *exec.ExitError
	if !errors.As(err, &ee) {
		return false
	}
	return ee.Exited()
}

// wait reaps the child exactly once. exec.Cmd.Wait errors if called twice, and
// both Close and WaitExitClean can reach it (the manager races reader-EOF
// against user-close), so the result is memoised. It also flips reaped, which
// Close and reapWithEscalation use to avoid signalling a pid after the
// process behind it is gone.
func (s *Session) wait() error {
	s.waitOnce.Do(func() {
		s.waitErr = s.cmd.Wait()
		s.reaped.Store(true)
	})
	return s.waitErr
}

// Close hangs up the shell and releases the pty, once. Safe to call from
// several goroutines. It signals the whole process group (negative pid —
// pty.StartWithSize sets Setsid, so the shell's pid is also its pgid), not
// just the shell itself, but that alone does not reach a detached background
// job: job-control shells put each job in its own process group, so
// kill(-shellpid, ...) never touches them directly. They still die because
// bash and zsh forward SIGHUP to their job table when the shell exits; a job
// that was explicitly disown'd, nohup'd, or setsid'd opts out of that
// forwarding and correctly survives, exactly as it would on a real terminal
// hangup. (Measured on darwin/arm64: closing the pty master on its own
// already makes the kernel deliver a hangup to the tty's foreground process
// group — an idle shell is reaped within milliseconds of Close, before the
// explicit signal below could even be the cause. That is tty-driver
// behaviour this package should not depend on cross-platform, so the
// explicit SIGHUP stays as the thing this code actually controls.) If the
// shell ignores SIGHUP outright (trap ” HUP), the background reap started
// here escalates to SIGKILL after reapGrace so it cannot spin forever,
// orphaned, with its pty gone.
func (s *Session) Close() error {
	s.closeOnce.Do(func() {
		pid := 0
		if s.cmd.Process != nil {
			pid = s.cmd.Process.Pid
		}
		if pid != 0 && !s.reaped.Load() {
			_ = syscall.Kill(-pid, syscall.SIGHUP)
		}
		s.closeErr = s.f.Close()
		// Reap in the background: Close must not block the manager's shutdown
		// path on a shell that ignores SIGHUP.
		go s.reapWithEscalation(pid)
	})
	return s.closeErr
}

// reapWithEscalation waits for the child to be reaped, and if it is still
// alive after reapGrace, sends SIGKILL to the whole process group before
// waiting again. syscall.Kill bypasses Go's os.Process "already done" guard,
// so the kill is gated on reaped: if wait() finished (even concurrently, via
// WaitExitClean) there is nothing left to signal, and the pid could since
// have been recycled as an unrelated process group leader.
func (s *Session) reapWithEscalation(pid int) {
	done := make(chan struct{})
	go func() {
		_ = s.wait()
		close(done)
	}()
	if pid == 0 {
		<-done
		return
	}
	timer := time.NewTimer(reapGrace)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
		if !s.reaped.Load() {
			_ = syscall.Kill(-pid, syscall.SIGKILL)
		}
		<-done
	}
}
