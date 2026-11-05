//go:build !darwin && !linux

package askpass

import (
	"errors"
	"net"
)

func peerPID(*net.UnixConn) int { return 0 }

func peerUID(*net.UnixConn) (int, error) {
	return -1, errors.New("peer credentials are not supported on this platform")
}
