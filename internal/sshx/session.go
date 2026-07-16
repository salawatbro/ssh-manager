package sshx

import (
	"io"
	"sync"

	"golang.org/x/crypto/ssh"
)

// TermType is the TERM value requested for every PTY (dizayn manbasi).
const TermType = "xterm-256color"

// Session is an interactive shell over a PTY on a live *ssh.Client. It owns
// the client: Close closes both. Read returns the merged stdout+stderr the
// PTY produces; Write feeds stdin. It never touches Wails or events — the
// term.Manager drives it through this plain interface (R-05).
type Session struct {
	client *ssh.Client
	sess   *ssh.Session
	stdin  io.WriteCloser
	stdout io.Reader
	once   sync.Once
}

// OpenSession requests a PTY and starts a login shell on client. cols/rows
// under 1 fall back to a sane 80x24 so a not-yet-measured frontend can't ask
// for a zero-sized tty. On any failure the half-built session and the client
// are closed, so the caller never leaks a client on error.
func OpenSession(client *ssh.Client, cols, rows int) (*Session, error) {
	if cols < 1 {
		cols = 80
	}
	if rows < 1 {
		rows = 24
	}
	sess, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		_ = sess.Close()
		_ = client.Close()
		return nil, err
	}
	// With a PTY the shell's stderr is merged into the pty master, so a single
	// StdoutPipe carries everything.
	stdout, err := sess.StdoutPipe()
	if err != nil {
		_ = sess.Close()
		_ = client.Close()
		return nil, err
	}
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := sess.RequestPty(TermType, rows, cols, modes); err != nil {
		_ = sess.Close()
		_ = client.Close()
		return nil, err
	}
	if err := sess.Shell(); err != nil {
		_ = sess.Close()
		_ = client.Close()
		return nil, err
	}
	return &Session{client: client, sess: sess, stdin: stdin, stdout: stdout}, nil
}

// Read pulls terminal output (blocking). Returns io.EOF when the remote shell
// exits or the connection drops — the manager's pump treats that as "closed".
func (s *Session) Read(p []byte) (int, error) { return s.stdout.Read(p) }

// Write sends input (keystrokes / paste) to the shell.
func (s *Session) Write(p []byte) (int, error) { return s.stdin.Write(p) }

// Resize tells the remote pty its new size (SIGWINCH). x/crypto takes rows,
// cols in that order — the opposite of the frontend's (cols, rows).
func (s *Session) Resize(cols, rows int) error {
	if cols < 1 {
		cols = 80
	}
	if rows < 1 {
		rows = 24
	}
	return s.sess.WindowChange(rows, cols)
}

// KeepAlive sends an OpenSSH keepalive global request and waits for the reply.
// A non-nil error means the peer is gone — the manager tears the session down.
func (s *Session) KeepAlive() error {
	_, _, err := s.client.SendRequest("keepalive@openssh.com", true, nil)
	return err
}

// Wait blocks until the remote shell exits.
func (s *Session) Wait() error { return s.sess.Wait() }

// Close closes the session and the client, once. Safe to call from several
// goroutines (the manager's shutdown races reader-EOF, dead-peer and
// user-close paths).
func (s *Session) Close() error {
	s.once.Do(func() {
		_ = s.sess.Close()
		_ = s.client.Close()
	})
	return nil
}
