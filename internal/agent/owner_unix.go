//go:build unix

package agent

import (
	"io/fs"
	"os"
	"syscall"
)

func ownedByMe(fi fs.FileInfo) bool {
	st, ok := fi.Sys().(*syscall.Stat_t)
	return ok && int(st.Uid) == os.Getuid()
}
