//go:build !darwin && !linux

package askpass

import (
	"errors"
	"net"
)

func peerUID(*net.UnixConn) (int, error) {
	return -1, errors.New("peer credentials are not supported on this platform")
}
