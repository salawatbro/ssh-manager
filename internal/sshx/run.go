package sshx

import (
	"bytes"
	"fmt"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// maxRunOutput caps what RunInput keeps of the remote output.
const maxRunOutput = 64 << 10

// RunInput runs cmd on the server with stdin as its standard input and
// returns its combined output. A non-zero exit is an error carrying the
// output; the session is closed when timeout passes.
func RunInput(client *ssh.Client, cmd string, stdin []byte, timeout time.Duration) (string, error) {
	return runSession(client, stdin, timeout, func(s *ssh.Session) error { return s.Run(cmd) })
}

// RunShell opens a shell without a terminal, as "ssh -T" does, and returns
// what the server prints before it ends the session.
func RunShell(client *ssh.Client, timeout time.Duration) (string, error) {
	return runSession(client, nil, timeout, func(s *ssh.Session) error {
		if err := s.Shell(); err != nil {
			return err
		}
		return s.Wait()
	})
}

func runSession(client *ssh.Client, stdin []byte, timeout time.Duration, run func(*ssh.Session) error) (string, error) {
	sess, err := client.NewSession()
	if err != nil {
		return "", domain.NewError(domain.CodeConnRefused, "The server refused to run a command: "+err.Error())
	}
	defer func() { _ = sess.Close() }()
	var out limitedBuffer
	sess.Stdin = bytes.NewReader(stdin)
	sess.Stdout = &out
	sess.Stderr = &out
	done := make(chan error, 1)
	go func() { done <- run(sess) }()
	select {
	case err = <-done:
	case <-time.After(timeout):
		_ = sess.Close()
		return out.String(), domain.NewError(domain.CodeConnTimeout, "The remote command timed out.")
	}
	if err != nil {
		return out.String(), fmt.Errorf("remote command failed: %w", err)
	}
	return out.String(), nil
}

// limitedBuffer is shared by stdout and stderr, which are copied from
// separate goroutines.
type limitedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if room := maxRunOutput - b.buf.Len(); room > 0 {
		_, _ = b.buf.Write(p[:min(len(p), room)])
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}
