//go:build !unix

package service

import "io/fs"

func ownedByMe(fs.FileInfo) bool { return false }
