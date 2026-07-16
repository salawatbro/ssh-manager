//go:build !windows

package sshx

import (
	"errors"
	"net"
	"os"
)

// dialAgent connects to the ssh-agent over the SSH_AUTH_SOCK unix socket.
func dialAgent() (net.Conn, error) {
	sock := os.Getenv("SSH_AUTH_SOCK")
	if sock == "" {
		return nil, errors.New("SSH_AUTH_SOCK is not set")
	}
	return net.Dial("unix", sock) //nolint:gosec // G704: sock is SSH_AUTH_SOCK, a local trust-boundary env var every SSH tool (ssh, ssh-add, OpenSSH itself) dials verbatim; this is a unix domain socket path, not a network address, so there is no SSRF here.
}
