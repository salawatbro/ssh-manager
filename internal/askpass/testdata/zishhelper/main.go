// Command zishhelper mirrors the app executable's helper modes for the
// end-to-end test, without building the whole Wails app.
package main

import (
	"os"
	"path/filepath"
	"syscall"

	"github.com/salawat/sshmgr/internal/askpass"
)

func main() {
	if filepath.Base(os.Args[0]) == askpass.LinkName {
		prompt := ""
		if len(os.Args) > 1 {
			prompt = os.Args[1]
		}
		os.Exit(askpass.RunAskpass(prompt, os.Getenv, os.Stdout, askpass.OpenDevTTY))
	}
	if len(os.Args) == 3 && os.Args[1] == "--connect" {
		os.Exit(askpass.RunConnect(os.Args[2], os.Getenv, os.Environ(), os.Stdout, os.Stderr, syscall.Exec))
	}
	os.Exit(2)
}
