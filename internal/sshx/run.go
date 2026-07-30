package sshx

import (
	"fmt"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Run executes cmd over an already-open connection on a fresh session channel
// (leaving any PTY on the same connection untouched) and returns its combined
// stdout. It is the general form of detectShell's safe exec: a host that accepts
// the channel and then never answers would block Output until the whole
// *ssh.Client is torn down, so on timeout the session is closed to unblock the
// goroutine rather than leaking it and its open remote channel.
func Run(conn *Conn, cmd string, timeout time.Duration) (string, error) {
	if conn == nil || conn.Client == nil {
		return "", fmt.Errorf("no live connection")
	}

	type result struct {
		out []byte
		err error
	}
	ch := make(chan result, 1) // buffered so the goroutine can always finish

	var mu sync.Mutex
	var sess *ssh.Session
	var timedOut bool

	go func() {
		s, err := conn.Client.NewSession()
		if err != nil {
			ch <- result{nil, err}
			return
		}
		mu.Lock()
		if timedOut {
			mu.Unlock()
			_ = s.Close()
			return
		}
		sess = s
		mu.Unlock()
		defer func() { _ = s.Close() }()
		out, err := s.Output(cmd)
		ch <- result{out, err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			return "", fmt.Errorf("command failed: %w", r.err)
		}
		return string(r.out), nil
	case <-time.After(timeout):
		mu.Lock()
		timedOut = true
		if sess != nil {
			_ = sess.Close()
		}
		mu.Unlock()
		return "", fmt.Errorf("command timed out after %s", timeout)
	}
}
