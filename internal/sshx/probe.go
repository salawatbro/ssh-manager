package sshx

import (
	"path"
	"strings"
	"time"
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
	type result struct {
		out []byte
		err error
	}
	// Buffered so the goroutine can always finish and exit even after the
	// timeout below has already given up on it.
	ch := make(chan result, 1)
	go func() {
		sess, err := conn.Client.NewSession()
		if err != nil {
			ch <- result{nil, err}
			return
		}
		defer func() { _ = sess.Close() }()
		out, err := sess.Output(`echo "$SHELL"`)
		ch <- result{out, err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			return ShellUnknown
		}
		return classifyShell(string(r.out))
	case <-time.After(shellProbeTimeout):
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
