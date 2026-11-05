//go:build !unix

package platform

import (
	"errors"
	"io/fs"
)

func ownedByMe(fs.FileInfo) bool { return true }

func lockFile(string) (func(), error) {
	return nil, errors.New("the instance lock is not supported on this platform")
}
