//go:build !darwin

package agent

import (
	"errors"
	"net"
)

func peerCred(*net.UnixConn) (uid, pid int, err error) {
	return -1, 0, errors.New("peer credentials are not supported on this platform")
}

func processInfo(pid int) ClientInfo { return ClientInfo{PID: pid} }

func procStart(int) (int64, bool) { return 0, false }
