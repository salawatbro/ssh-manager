//go:build unix

package askpass

import (
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"golang.org/x/term"
)

type devTTY struct{ f *os.File }

// OpenDevTTY opens the controlling terminal of the ssh that started us.
func OpenDevTTY() (TTY, error) {
	f, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	return &devTTY{f: f}, nil
}

func (t *devTTY) Write(p []byte) (int, error) { return t.f.Write(p) }
func (t *devTTY) Close() error                { return t.f.Close() }

func (t *devTTY) ReadLine() (string, error) {
	stop := exitOnSignal(func() {})
	defer stop()
	var b strings.Builder
	buf := make([]byte, 1)
	for {
		n, err := t.f.Read(buf)
		if n == 1 {
			if buf[0] == '\n' {
				return strings.TrimSuffix(b.String(), "\r"), nil
			}
			b.WriteByte(buf[0])
		}
		if err != nil {
			if b.Len() > 0 && err == io.EOF {
				return b.String(), nil
			}
			return "", err
		}
	}
}

func (t *devTTY) ReadPassword() (string, error) {
	fd := int(t.f.Fd())
	old, err := term.GetState(fd)
	if err != nil {
		return "", err
	}
	stop := exitOnSignal(func() {
		_ = term.Restore(fd, old)
		_, _ = t.f.WriteString("\n")
	})
	defer stop()
	pw, err := term.ReadPassword(fd)
	_, _ = t.f.WriteString("\n")
	if err != nil {
		return "", err
	}
	s := string(pw)
	clear(pw)
	return s, nil
}

// exitOnSignal makes Ctrl-C at a prompt exit 1 (ssh treats it as cancelled)
// after restoring the terminal.
func exitOnSignal(restore func()) (stop func()) {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	done := make(chan struct{})
	go func() {
		select {
		case <-c:
			restore()
			os.Exit(1)
		case <-done:
		}
	}()
	return func() {
		signal.Stop(c)
		close(done)
	}
}
