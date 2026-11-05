//go:build !unix

package askpass

import "errors"

// OpenDevTTY is unavailable off Unix.
func OpenDevTTY() (TTY, error) { return nil, errors.New("no controlling terminal on this platform") }
