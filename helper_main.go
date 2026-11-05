package main

import (
	"os"
	"path/filepath"

	"github.com/salawat/sshmgr/internal/askpass"
)

type helperMode int

const (
	modeGUI helperMode = iota
	modeAskpass
	modeConnect
)

// detectHelperMode picks the mode from argv alone. ssh runs askpass through
// the zish-askpass symlink with the prompt as argv[1]; the launch script runs
// "--connect <token>".
func detectHelperMode(args []string) (helperMode, string) {
	arg := func(i int) string {
		if i < len(args) {
			return args[i]
		}
		return ""
	}
	if len(args) == 0 {
		return modeGUI, ""
	}
	if filepath.Base(args[0]) == askpass.LinkName {
		return modeAskpass, arg(1)
	}
	switch arg(1) {
	case "--askpass":
		return modeAskpass, arg(2)
	case "--connect":
		return modeConnect, arg(2)
	}
	return modeGUI, ""
}

// runHelperIfRequested runs the askpass or connect helper and reports its
// exit code. It must run before anything opens the DB, writes logs, builds
// the Wails app or touches cgo UI code.
func runHelperIfRequested(args []string) (exitCode int, handled bool) {
	mode, arg := detectHelperMode(args)
	switch mode {
	case modeAskpass:
		return askpass.RunAskpass(arg, os.Getenv, os.Stdout, askpass.OpenDevTTY), true
	case modeConnect:
		return askpass.RunConnect(arg, os.Getenv, os.Environ(), os.Stdout, os.Stderr, execProcess), true
	}
	return 0, false
}
