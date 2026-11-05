//go:build !unix

package agent

import "io/fs"

func ownedByMe(fs.FileInfo) bool { return false }
