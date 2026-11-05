// Package launcher turns a server record into an OpenSSH command and opens it
// in the user's terminal app. No server or user value is ever interpolated
// into a shell or AppleScript string: ssh receives values as execve argv or
// through its own config parser, and scripts are constants.
package launcher

import (
	"fmt"
	"strings"

	"github.com/salawat/sshmgr/internal/domain"
)

// shellUnsafe lists the characters that make POSIX shells do something other
// than pass the word through literally. '~' is deliberately absent: a
// leading tilde in a pasted key path should still expand.
const shellUnsafe = "\t\n\r \"#$&'()*;<>?[\\]`{|}!"

// shellQuote wraps s in single quotes when a shell would interpret any of
// it; an embedded single quote is closed, escaped and reopened.
func shellQuote(s string) string {
	if s == "" {
		return "''"
	}
	if !strings.ContainsAny(s, shellUnsafe) {
		return s
	}
	return singleQuote(s)
}

func singleQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func unsafeValue(field string) error {
	return domain.NewError(domain.CodeLaunchUnsafe,
		fmt.Sprintf("The %s contains characters Zish can't pass to ssh safely.", field))
}

// checkNoControl rejects C0 control characters and DEL.
func checkNoControl(field, s string) error {
	for i := 0; i < len(s); i++ {
		if s[i] < 0x20 || s[i] == 0x7f {
			return unsafeValue(field)
		}
	}
	return nil
}

// sshConfigValue encodes s as one ssh_config / -o value: ssh splits the line
// with argv_split (quotes, \" and \\) and then expands %-tokens and ${ENV}.
// A newline would start a new directive, so control characters are refused.
func sshConfigValue(field, s string) (string, error) {
	if err := checkNoControl(field, s); err != nil {
		return "", err
	}
	if strings.Contains(s, "${") {
		return "", unsafeValue(field)
	}
	s = strings.ReplaceAll(s, "%", "%%")
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`, nil
}

// ConfigValue encodes s as one quoted ssh_config value, for the snippets Zish
// shows the user to paste into ~/.ssh/config.
func ConfigValue(field, s string) (string, error) {
	return sshConfigValue(field, s)
}
