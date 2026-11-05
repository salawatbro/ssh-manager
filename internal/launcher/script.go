package launcher

import (
	"errors"
	"fmt"
	"path/filepath"

	"github.com/salawat/sshmgr/internal/askpass"
)

// scriptTemplate is the whole launch script. Only the quoted executable path
// and the hex token are substituted; no server data ever appears in it. Exit
// 255 (ssh's own error status, and the helper's) pauses so the error stays
// readable in terminals that close the window when the command ends.
const scriptTemplate = `#!/bin/sh
rm -f -- "$0"
%s --connect %s
status=$?
if [ "$status" -eq 255 ]; then
  printf '\n[Zish] ssh exited with an error. Press Return to close this window.\n'
  read -r _
fi
exit "$status"
`

// Script returns the connect.command contents for one launch token.
func Script(exePath, token string) ([]byte, error) {
	if !askpass.ValidToken(token) {
		return nil, errors.New("launch token is not 64 hex characters")
	}
	if !filepath.IsAbs(exePath) {
		return nil, errors.New("executable path is not absolute")
	}
	if err := checkNoControl("app path", exePath); err != nil {
		return nil, err
	}
	return fmt.Appendf(nil, scriptTemplate, singleQuote(exePath), token), nil
}
