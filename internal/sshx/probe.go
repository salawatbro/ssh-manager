package sshx

import (
	"path"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Shell is the login shell detected on the target. The zero value is
// ShellUnknown, which is also what every failure path returns — the JSON value
// crosses to the frontend, where "" means "do not inject anything".
type Shell string

// The shells with an OSC 133 integration snippet, plus the catch-all.
const (
	ShellBash    Shell = "bash"
	ShellZsh     Shell = "zsh"
	ShellFish    Shell = "fish"
	ShellUnknown Shell = ""
)

// shellProbeTimeout bounds the probe independently of the dial timeouts: it
// runs on an established connection, so a slow answer means a busy or weird
// host, not a network problem. Falling back to ShellUnknown costs the user
// only the integration, never the session.
const shellProbeTimeout = 3 * time.Second

// DetectShell asks the target for its login shell over a short, PTY-less exec
// channel. It NEVER fails the caller: a refused channel (ForceCommand,
// sftp-only account), a disabled exec, a timeout or an unrecognised shell all
// return ShellUnknown, and the caller simply opens a plain terminal.
//
// Called before OpenSession so an unsupported shell never receives the POSIX
// snippet — that blind injection is what made csh/tcsh print a parse error on
// every connect.
func DetectShell(conn *Conn) Shell {
	return detectShell(conn, shellProbeTimeout)
}

// detectShell is DetectShell with an injectable timeout, so tests can exercise
// the timeout path without a multi-second sleep.
func detectShell(conn *Conn, timeout time.Duration) Shell {
	if conn == nil || conn.Client == nil {
		return ShellUnknown
	}

	type result struct {
		out []byte
		err error
	}
	// Buffered so the goroutine can always finish and exit even after the
	// timeout below has already given up on it.
	ch := make(chan result, 1)

	// mu guards sess and timedOut, which are written from both this
	// goroutine and the one below: a host that accepts the exec channel and
	// then never answers leaves sess.Output blocked until the *ssh.Client
	// itself is closed, so on timeout we close the session ourselves to
	// unblock it and let the goroutine finish instead of leaking it (and its
	// open remote channel) for the rest of the connection's life.
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
			// The timeout already fired before we could publish sess; there
			// is nothing left to unblock us, so tear down ourselves.
			mu.Unlock()
			_ = s.Close()
			return
		}
		sess = s
		mu.Unlock()
		defer func() { _ = s.Close() }()
		out, err := s.Output(`echo "$SHELL"`)
		ch <- result{out, err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			return ShellUnknown
		}
		return classifyShell(string(r.out))
	case <-time.After(timeout):
		mu.Lock()
		timedOut = true
		if sess != nil {
			// Closing the session unblocks the goroutine's Output call so
			// it can exit instead of leaking.
			_ = sess.Close()
		}
		mu.Unlock()
		return ShellUnknown
	}
}

// classifyShell maps a $SHELL value to a Shell. It takes the path's base name
// and strips a leading '-' (the login-shell argv[0] convention), so
// "/bin/bash", "-bash" and "  /opt/homebrew/bin/fish\r\n" all classify.
func classifyShell(raw string) Shell {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ShellUnknown
	}
	switch strings.TrimPrefix(path.Base(s), "-") {
	case "bash":
		return ShellBash
	case "zsh":
		return ShellZsh
	case "fish":
		return ShellFish
	}
	return ShellUnknown
}
