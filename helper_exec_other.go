//go:build !unix

package main

import "errors"

func execProcess(string, []string, []string) error {
	return errors.New("launching ssh is not supported on this platform")
}
