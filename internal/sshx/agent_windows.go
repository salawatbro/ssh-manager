//go:build windows

package sshx

import (
	"context"
	"net"
	"os"
	"strings"

	"github.com/Microsoft/go-winio"
)

// dialAgent connects to the Windows ssh-agent. Windows OpenSSH exposes the
// agent on the named pipe \\.\pipe\openssh-ssh-agent and usually does NOT
// set SSH_AUTH_SOCK. Third-party agents (1Password, WSL bridges) may set it
// to a pipe path or an AF_UNIX socket path, so try those first.
func dialAgent() (net.Conn, error) {
	const defaultPipe = `\\.\pipe\openssh-ssh-agent`
	ctx := context.Background()
	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if strings.HasPrefix(sock, `\\.\pipe\`) {
			return winio.DialPipeContext(ctx, sock)
		}
		if c, err := net.Dial("unix", sock); err == nil {
			return c, nil
		}
	}
	return winio.DialPipeContext(ctx, defaultPipe)
}
