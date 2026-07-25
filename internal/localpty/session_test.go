package localpty

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// openForTest opens a session and registers its reap on t.Cleanup so every
// test call site — including a t.Fatalf on any later line — still tears the
// child down. A leaked shell from a failing test would otherwise survive the
// process and pile up across -count=N runs.
func openForTest(t *testing.T, cols, rows int) *Session {
	t.Helper()
	s, err := Open(cols, rows)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

// stillAlive reports whether pid still exists, using signal 0 (no signal
// sent, existence check only) rather than a nil os.Signal: p.Signal(nil)
// unconditionally returns "unsupported signal type" on unix regardless of
// whether the process is alive, which is why the original version of this
// check never actually observed anything.
func stillAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}

// waitGone polls stillAlive until pid is gone or the deadline passes.
func waitGone(t *testing.T, pid int, d time.Duration) bool {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if !stillAlive(pid) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

// waitFileExists polls for path to appear on disk. Used as a readiness signal
// that is immune to the false-positive that sank an earlier version of
// TestCloseEscalatesToSigkillWhenShellIgnoresSighup: zsh's line editor plus
// bracketed paste redraws the typed command as it is entered, so a marker
// read back from the pty's own output can appear twice from echo alone, with
// the command that was supposed to produce it never having run. A file only
// exists once `touch` has actually executed, so there is no echo path that
// can fake it.
func waitFileExists(t *testing.T, path string, d time.Duration) bool {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

// waitProcRunning polls `ps -o state=` for pid until it reports a running
// state (leading 'R', e.g. "R" or "Rs+") or the deadline passes. This is the
// second half of proving the busy loop is actually spinning rather than
// merely having been typed: the marker file confirms the trap line ran, this
// confirms the `while :; do :; done` after it is genuinely executing, not
// just sitting in the tty's echo buffer.
func waitProcRunning(t *testing.T, pid int, d time.Duration) bool {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		out, err := exec.Command("ps", "-o", "state=", "-p", strconv.Itoa(pid)).Output()
		if err == nil {
			if state := strings.TrimSpace(string(out)); strings.HasPrefix(state, "R") {
				return true
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

// drainInBackground discards s's output on a background goroutine until Read
// errors (the pty closes or the shell exits). A test that waits on an
// external readiness signal (a file, a process state) instead of reading s
// itself must still drain it: the pty's output buffer is finite, and a shell
// that blocks mid-write() because nobody is reading its tty cannot go on to
// execute the very commands the test is waiting for. The goroutine exits on
// its own once the session is closed, so callers do not need to stop it.
func drainInBackground(s *Session) {
	go func() {
		buf := make([]byte, 4096)
		for {
			if _, err := s.Read(buf); err != nil {
				return
			}
		}
	}()
}

// readUntil reads from s until want appears or the deadline passes. A pty echoes
// input, so the assertion has to tolerate the echo arriving in pieces.
func readUntil(t *testing.T, s *Session, want string, d time.Duration) string {
	t.Helper()
	return readUntilCount(t, s, want, 1, d)
}

// readUntilCount reads from s until want has appeared at least count times, or
// the deadline passes. This matters whenever want is itself typed as part of
// a command: the pty's local echo reflects the raw input line back (including
// any literal text the command will later print) before the shell has
// executed anything, so a single-occurrence wait can be satisfied by the
// echo alone. Waiting for a second occurrence forces a wait for the command's
// actual stdout, proving execution reached that point rather than merely
// having been typed.
func readUntilCount(t *testing.T, s *Session, want string, count int, d time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(d)
	var sb strings.Builder
	buf := make([]byte, 4096)
	for time.Now().Before(deadline) {
		n, err := s.Read(buf)
		sb.Write(buf[:n])
		if strings.Count(sb.String(), want) >= count {
			return sb.String()
		}
		if err != nil {
			break
		}
	}
	return sb.String()
}

func TestOpenRunsAShellThatEchoesAndExits(t *testing.T) {
	s := openForTest(t, 80, 24)
	if s.Shell() == "" {
		t.Error("Shell() is empty")
	}
	if _, err := s.Write([]byte("echo zish-marker\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if got := readUntil(t, s, "zish-marker", 5*time.Second); !strings.Contains(got, "zish-marker") {
		t.Fatalf("never saw the marker; read %q", got)
	}
}

// The term.Manager's pump keys "clean exit, close the pane silently" off
// Read returning io.EOF. On darwin a raw pty-master read returns plain
// io.EOF once the shell is gone (measured on darwin/arm64, go1.26.5) — this
// test pins that down directly rather than assuming the EIO/os.ErrClosed
// translation is what produces it.
func TestReadReturnsEOFAfterTheShellExits(t *testing.T) {
	s := openForTest(t, 80, 24)

	if _, err := s.Write([]byte("exit\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	buf := make([]byte, 4096)
	for time.Now().Before(deadline) {
		_, err := s.Read(buf)
		if err == nil {
			continue
		}
		if !errors.Is(err, io.EOF) {
			t.Fatalf("Read error = %v, want io.EOF", err)
		}
		if !s.WaitExitClean() {
			t.Error("WaitExitClean() = false for a normal `exit`")
		}
		return
	}
	t.Fatal("Read never reported EOF after exit")
}

// A non-zero exit is still a clean process exit, mirroring
// sshx.Session.WaitExitClean's TestWaitExitCleanTrueOnNonZeroExitStatus.
func TestWaitExitCleanTrueOnNonZeroExitStatus(t *testing.T) {
	s := openForTest(t, 80, 24)

	if _, err := s.Write([]byte("exit 7\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	// Drain to EOF before waiting, same order the manager's pump uses.
	deadline := time.Now().Add(5 * time.Second)
	buf := make([]byte, 4096)
	for {
		if time.Now().After(deadline) {
			t.Fatal("never saw EOF after `exit 7`")
		}
		if _, err := s.Read(buf); err != nil {
			break
		}
	}
	if !s.WaitExitClean() {
		t.Error("WaitExitClean() = false, want true for a non-zero `exit 7`")
	}
}

// A shell that was signalled (killed, OOM, crashed) must NOT be reported as
// a clean exit — this is Critical finding 1. errors.As(err, &ee) alone is
// true for both an exited-non-zero AND a signalled child, since both produce
// an *exec.ExitError; only ProcessState.Exited() tells them apart.
func TestWaitExitCleanFalseWhenShellIsKilled(t *testing.T) {
	s := openForTest(t, 80, 24)

	if err := s.cmd.Process.Kill(); err != nil { // SIGKILL to the process itself
		t.Fatalf("Kill: %v", err)
	}
	if s.WaitExitClean() {
		t.Error("WaitExitClean() = true for a SIGKILLed shell, want false")
	}
}

func TestResizeAndKeepAlive(t *testing.T) {
	s := openForTest(t, 80, 24)

	if err := s.Resize(120, 40); err != nil {
		t.Errorf("Resize: %v", err)
	}
	// Out-of-range values clamp instead of erroring (same rule as
	// sshx.OpenSession's 80x24 fallback).
	if err := s.Resize(0, 0); err != nil {
		t.Errorf("Resize(0,0): %v", err)
	}
	// A local peer cannot go away behind our back — the manager's probe is a
	// no-op here, and must never tear the session down.
	if err := s.KeepAlive(); err != nil {
		t.Errorf("KeepAlive() = %v, want nil", err)
	}
}

// A too-large dimension must clamp to the uint16 max, not wrap around (65616
// truncates to 80 via a bare uint16(65616) conversion). This asserts on
// clampDim directly rather than on Resize's return value: pty.Setsize
// succeeds either way, so a Resize(65616, 24)-returns-nil assertion stays
// green even with the max clamp deleted entirely — it was never exercising
// the thing its docstring claimed to prove.
func TestClampDimClampsInsteadOfWrapping(t *testing.T) {
	if got := clampDim(65616, 80); got != maxPtyDim {
		t.Errorf("clampDim(65616, 80) = %d, want %d (the uint16 max, not the 80 a bare uint16(65616) conversion wraps to)", got, maxPtyDim)
	}
}

// -l is a spec requirement (see Open's doc comment): without it the shell is
// not a login shell, so the user's rc files never run and PATH/the prompt are
// whatever the app process inherited — silently wrong rather than broken, so
// nothing else in this suite catches its absence. This asserts on the actual
// argv rather than on shell behaviour.
func TestOpenRunsTheShellAsALoginShell(t *testing.T) {
	s := openForTest(t, 80, 24)
	args := s.cmd.Args
	if len(args) < 2 || args[1] != "-l" {
		t.Fatalf("cmd.Args = %v, want a -l login-shell flag as the first argument", args)
	}
}

func TestNormalizeShellName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"/bin/zsh", "zsh"},
		{"/bin/bash", "bash"},
		{"/opt/homebrew/bin/fish", "fish"},
		{"/bin/ls", "ls"},           // not bash/zsh/fish — passed through, not "unknown"
		{"-bash", "bash"},           // login-shell argv0 convention
		{"  /bin/zsh  \r\n", "zsh"}, // surrounding whitespace
		{"", "."},                   // filepath.Base("") == "."; Open never reaches this (empty $SHELL falls back to defaultShell first)
	}
	for _, c := range cases {
		if got := normalizeShellName(c.in); got != c.want {
			t.Errorf("normalizeShellName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// A cooperative shell (the common case: no SIGHUP trap) must die from the
// SIGHUP itself, well within reapGrace — not from the SIGKILL escalation
// that exists for the uncooperative case. The deadline here is deliberately
// tighter than reapGrace so that deleting the SIGHUP from Close fails this
// test instead of silently passing off the escalation's back (see
// TestCloseEscalatesToSigkillWhenShellIgnoresSighup for that path).
// exec.Cmd.Wait is documented to error if called twice, and is not safe to
// call concurrently at all. wait()'s memoisation exists precisely because
// the manager races reader-EOF (WaitExitClean) against user-close (Close,
// which reaps in the background too) — this fires several concurrent
// callers at s.wait() and asserts they all observe the one true result
// instead of some of them tripping the "already called" error path (which
// is not an *exec.ExitError, so WaitExitClean would wrongly report false
// for what was actually a clean exit).
func TestWaitExitCleanIsConsistentAcrossConcurrentCallers(t *testing.T) {
	s := openForTest(t, 80, 24)

	if _, err := s.Write([]byte("exit\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	buf := make([]byte, 4096)
	for {
		if time.Now().After(deadline) {
			t.Fatal("never saw EOF after `exit`")
		}
		if _, err := s.Read(buf); err != nil {
			break
		}
	}

	const callers = 16
	var wg sync.WaitGroup
	results := make([]bool, callers)
	wg.Add(callers)
	for i := range results {
		go func(i int) {
			defer wg.Done()
			results[i] = s.WaitExitClean()
		}(i)
	}
	wg.Wait()
	for i, got := range results {
		if !got {
			t.Errorf("WaitExitClean() call %d = false, want true (concurrent callers must agree on the memoised result)", i)
		}
	}
}

func TestCloseIsIdempotentAndReapsTheChild(t *testing.T) {
	s := openForTest(t, 80, 24)
	pid := s.cmd.Process.Pid

	if err := s.Close(); err != nil {
		t.Errorf("first Close: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Errorf("second Close: %v", err)
	}
	if !waitGone(t, pid, reapGrace/2) {
		t.Fatalf("child %d still alive %s after Close (expected SIGHUP to reap it well before the %s SIGKILL escalation)", pid, reapGrace/2, reapGrace)
	}
}

// Close must propagate the pty file's Close error instead of swallowing it.
func TestCloseReturnsTheUnderlyingFileCloseError(t *testing.T) {
	s := openForTest(t, 80, 24)

	if err := s.f.Close(); err != nil {
		t.Fatalf("pre-closing the pty file: %v", err)
	}
	if err := s.Close(); err == nil {
		t.Error("Close() = nil, want the pty file's already-closed error")
	}
}

// Important finding 3: a shell that ignores SIGHUP must not be left running.
// Without the SIGKILL escalation, this shell survives Close() indefinitely,
// pinned at 100% CPU with its pty gone.
//
// Readiness cannot be proven by reading the marker back from the pty's own
// output: zsh's line editor plus bracketed paste redraws the typed command as
// it is entered, so the marker text can appear twice from echo alone — with
// the command that was supposed to produce it never having run. (Two earlier
// versions of this test got fooled this way: a 300ms guess that raced the
// shell's own rc-file startup, then a pty-readback marker waited for twice,
// which is exactly the count the redraw produces on its own.) Readiness here
// is instead proven two ways that echo cannot fake: a file that only exists
// once `touch` has actually run, and `ps -o state=` showing the process is
// genuinely executing (R*), not merely sitting on a typed-but-unexecuted
// line.
//
// reapGrace is shrunk for the duration of this test so the suite stays fast;
// asserting elapsed >= reapGrace below pins that the SIGKILL escalation —
// not a plain hangup racing it — is what actually reaped the child. A
// shipped version of this test that finished in well under reapGrace would
// be measuring a plain SIGHUP kill, not the escalation this test exists to
// cover.
// Must not use t.Parallel: it rewrites the package-global reapGrace for its
// duration, so a concurrent sibling closing a session would see this test's
// 200ms grace instead of the production one, or race the cleanup restoring it.
// reapGraceMu makes that safe from a data race, not from a wrong value.
func TestCloseEscalatesToSigkillWhenShellIgnoresSighup(t *testing.T) {
	origGrace := setReapGrace(200 * time.Millisecond)
	t.Cleanup(func() { setReapGrace(origGrace) })

	s := openForTest(t, 80, 24)
	pid := s.cmd.Process.Pid
	// Safety net independent of Close's own behaviour, so a regression here
	// fails the test instead of leaving a spinning process behind on the
	// machine running it. Gated on stillAlive: by the time this cleanup
	// runs, Close's own reaper has (if it worked) already reaped the child,
	// and signalling an already-reaped pid risks hitting an unrelated
	// process group the OS has since recycled it as — the exact hazard
	// Session.reaped exists to prevent in production code.
	t.Cleanup(func() {
		if stillAlive(pid) {
			_ = killProcessGroup(pid, syscall.SIGKILL)
		}
	})

	// The test drives readiness off a file and `ps`, not off reading s, but
	// the pty still has to be drained: otherwise the shell's own startup
	// output (prompt, rc files) can fill the tty buffer and block the shell
	// in write() before it ever reaches the touch/loop line below.
	drainInBackground(s)

	dir := t.TempDir()
	marker := filepath.Join(dir, "zish-trap-ready")
	cmd := "trap '' HUP; touch " + marker + "; while :; do :; done\n"
	if _, err := s.Write([]byte(cmd)); err != nil {
		t.Fatalf("Write: %v", err)
	}

	if !waitFileExists(t, marker, 5*time.Second) {
		t.Fatal("trap-installed marker file never appeared; the shell may not have reached the busy loop")
	}
	if !waitProcRunning(t, pid, 5*time.Second) {
		t.Fatalf("shell %d was never observed in a running (R*) state; the busy loop may not actually be executing", pid)
	}

	start := time.Now()
	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
	if !waitGone(t, pid, 5*time.Second) {
		t.Fatalf("child %d (SIGHUP-immune) survived Close's SIGKILL escalation", pid)
	}
	if elapsed, grace := time.Since(start), getReapGrace(); elapsed < grace {
		t.Errorf("child was reaped after %s, less than reapGrace (%s); a plain SIGHUP appears to have killed it, so this test isn't exercising the SIGKILL escalation", elapsed, grace)
	}
}
