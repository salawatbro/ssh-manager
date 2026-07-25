//go:build !windows

package localpty

import "syscall"

// killProcessGroup sends sig to the process group led by pid, using the
// negative-pid convention (see Close and reapWithEscalation for why the
// whole group is targeted rather than just the shell). syscall.Kill has no
// Windows equivalent — POSIX process groups don't exist there — which is why
// this lives behind a build tag; see kill_windows.go for that side.
func killProcessGroup(pid int, sig syscall.Signal) error {
	return syscall.Kill(-pid, sig)
}
