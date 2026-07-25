//go:build windows

package localpty

import (
	"errors"
	"syscall"
)

// killProcessGroup is unsupported on Windows: there is no POSIX process
// group and no syscall.Kill to send to one, so this package's group-signal
// teardown (see Close and reapWithEscalation) cannot run there. Local ptys
// are not wired up for Windows yet (Open assumes /bin/zsh-style shells and a
// unix pty master); this stub exists only so internal/... keeps
// cross-compiling for GOOS=windows.
func killProcessGroup(pid int, sig syscall.Signal) error {
	return errors.ErrUnsupported
}
