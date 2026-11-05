package agent

import (
	"net"

	"golang.org/x/sys/unix"
)

// peerCred returns the uid and pid of the process on the other end of c.
func peerCred(c *net.UnixConn) (uid, pid int, err error) {
	raw, err := c.SyscallConn()
	if err != nil {
		return -1, 0, err
	}
	uid = -1
	var credErr error
	if err := raw.Control(func(fd uintptr) {
		var cred *unix.Xucred
		cred, credErr = unix.GetsockoptXucred(int(fd), unix.SOL_LOCAL, unix.LOCAL_PEERCRED)
		if credErr != nil {
			return
		}
		uid = int(cred.Uid)
		// The pid is display-only; a failure leaves it 0.
		pid, _ = unix.GetsockoptInt(int(fd), unix.SOL_LOCAL, unix.LOCAL_PEERPID)
	}); err != nil {
		return -1, 0, err
	}
	return uid, pid, credErr
}
