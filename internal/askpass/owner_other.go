//go:build !unix

package askpass

import "io/fs"

func ownedByMe(fs.FileInfo) bool { return false }
