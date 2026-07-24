package localpty

import (
	"errors"
	"io"
	"os"
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

// A too-large dimension must clamp to the uint16 max, not wrap around
// (65616 truncates to 80 via a bare uint16(65616) conversion).
func TestResizeClampsOversizedDimensions(t *testing.T) {
	s := openForTest(t, 80, 24)

	if err := s.Resize(65616, 24); err != nil {
		t.Errorf("Resize(65616, 24): %v", err)
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
// pinned at 100% CPU with its pty gone. The t.Cleanup below is a safety net
// independent of Close's own behaviour, so a regression here fails the test
// instead of leaving a spinning process behind on the machine running it.
//
// The trap has to be confirmed actually installed and in effect — via a
// readback marker that only appears from the command's real stdout, waited
// for twice (see readUntilCount) — rather than assumed after a fixed sleep
// or a single occurrence. Two earlier versions of this test got this wrong:
// one used a 300ms guess that raced the shell's own rc-file startup; the
// next waited for a single occurrence of the marker text, which the pty's
// local echo of the typed command line satisfies on its own, before the
// shell has executed anything. Both variants could measure a plain
// (non-trapped) SIGHUP kill and still pass, regardless of whether the
// escalation path worked at all.
func TestCloseEscalatesToSigkillWhenShellIgnoresSighup(t *testing.T) {
	s := openForTest(t, 80, 24)
	pid := s.cmd.Process.Pid
	t.Cleanup(func() { _ = syscall.Kill(-pid, syscall.SIGKILL) })

	if _, err := s.Write([]byte("trap '' HUP; echo zish-trap-ready; while :; do :; done\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	// First occurrence is the pty's echo of the typed line; second is the
	// echo command's actual stdout, which only appears once trap has run.
	if got := readUntilCount(t, s, "zish-trap-ready", 2, 5*time.Second); strings.Count(got, "zish-trap-ready") < 2 {
		t.Fatalf("never saw the trap-installed marker run (only typed, not executed); read %q", got)
	}

	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
	if !waitGone(t, pid, 5*time.Second) {
		t.Fatalf("child %d (SIGHUP-immune) survived Close's SIGKILL escalation", pid)
	}
}
