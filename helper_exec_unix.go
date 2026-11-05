//go:build unix

package main

import "syscall"

func execProcess(path string, argv, env []string) error {
	return syscall.Exec(path, argv, env) //nolint:gosec // G204: argv comes from the running Zish over the private control socket
}
