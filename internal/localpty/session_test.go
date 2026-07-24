package localpty

import (
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

// readUntil reads from s until want appears or the deadline passes. A pty echoes
// input, so the assertion has to tolerate the echo arriving in pieces.
func readUntil(t *testing.T, s *Session, want string, d time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(d)
	var sb strings.Builder
	buf := make([]byte, 4096)
	for time.Now().Before(deadline) {
		n, err := s.Read(buf)
		sb.Write(buf[:n])
		if strings.Contains(sb.String(), want) {
			return sb.String()
		}
		if err != nil {
			break
		}
	}
	return sb.String()
}

func TestOpenRunsAShellThatEchoesAndExits(t *testing.T) {
	s, err := Open(80, 24)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if s.Shell() == "" {
		t.Error("Shell() is empty")
	}
	if _, err := s.Write([]byte("echo zish-marker\n")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if got := readUntil(t, s, "zish-marker", 5*time.Second); !strings.Contains(got, "zish-marker") {
		t.Fatalf("never saw the marker; read %q", got)
	}
	if err := s.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

// The term.Manager's pump keys "clean exit, close the pane silently" off
// Read returning io.EOF. On darwin a pty master reports EIO once the child is
// gone, so Read has to translate it or every local `exit` would look like a
// dropped connection.
func TestReadReturnsEOFAfterTheShellExits(t *testing.T) {
	s, err := Open(80, 24)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

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

func TestResizeAndKeepAlive(t *testing.T) {
	s, err := Open(80, 24)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

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

func TestCloseIsIdempotentAndReapsTheChild(t *testing.T) {
	s, err := Open(80, 24)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	pid := s.cmd.Process.Pid
	if err := s.Close(); err != nil {
		t.Errorf("first Close: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Errorf("second Close: %v", err)
	}
	// The child must be gone: signal 0 to a reaped pid fails.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		p, err := os.FindProcess(pid)
		if err != nil {
			return
		}
		if err := p.Signal(os.Signal(nil)); err != nil {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("child %d still alive after Close", pid)
}
