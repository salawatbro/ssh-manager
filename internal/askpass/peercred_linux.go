package askpass

import (
	"net"

	"golang.org/x/sys/unix"
)

func peerUID(c *net.UnixConn) (int, error) {
	raw, err := c.SyscallConn()
	if err != nil {
		return -1, err
	}
	uid := -1
	var credErr error
	if err := raw.Control(func(fd uintptr) {
		var cred *unix.Ucred
		cred, credErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
		if credErr == nil {
			uid = int(cred.Uid)
		}
	}); err != nil {
		return -1, err
	}
	return uid, credErr
}
