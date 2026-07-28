package platform

import "runtime"

// Platform reports what this binary was COMPILED for, not the CPU it happens
// to be running on: under Rosetta an amd64 build on Apple silicon still
// reports amd64. That is the right answer for an About screen, which is
// describing the build the user installed.
func Platform() (goos, goarch string) {
	return runtime.GOOS, runtime.GOARCH
}
