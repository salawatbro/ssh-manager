// Package service holds application-level operations that combine domain
// types with side effects such as rendering shell commands or talking to the
// store. It may depend on internal/domain, internal/store and the standard
// library (NFR-05).
package service

import (
	"fmt"
	"strings"

	"github.com/salawat/sshmgr/internal/domain"
)

// shellUnsafe lists the characters that make POSIX shells do something other
// than pass the word through literally.
//
// Deviation from the task-6 brief: the brief's const also listed '~'. Tilde
// expansion only fires when '~' is the first byte of an unquoted word, and
// KeyPath ("~/.ssh/id_ed25519") is exactly that word — quoting it would
// freeze the tilde and defeat the home-directory expansion the user expects.
// It also does not reopen SEC-07: none of the fields this file renders can
// turn '~' into a second shell command, only (at worst) an unresolved
// tilde-user lookup that the shell leaves untouched when no such account
// exists. Keeping '~' unsafe made two of the brief's own expected strings
// fail (see task-6-report.md), so it was dropped here; every other
// character from the brief's list is unchanged.
const shellUnsafe = "\t\n\r \"#$&'()*;<>?[\\]`{|}!"

// shellQuote wraps s in single quotes when it contains anything a shell would
// interpret, and escapes any embedded single quote by closing, escaping and
// reopening, e.g. for the input it's:
//
//	'it'\''s'
//
// SEC-07: server name, host, user and key path all come from user input and
// end up in a command the user pastes into a shell.
func shellQuote(s string) string {
	if s == "" {
		return "''"
	}
	if !strings.ContainsAny(s, shellUnsafe) {
		return s
	}
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// SSHCommand renders the openssh command that reproduces this connection
// (FR-01.9). jump may be nil.
func SSHCommand(s domain.Server, jump *domain.Server) string {
	parts := []string{"ssh"}

	if s.Port != 0 && s.Port != 22 {
		parts = append(parts, "-p", fmt.Sprintf("%d", s.Port))
	}
	if s.AuthType == domain.AuthKey && strings.TrimSpace(s.KeyPath) != "" {
		parts = append(parts, "-i", shellQuote(s.KeyPath))
	}
	if jump != nil {
		target := fmt.Sprintf("%s@%s", jump.User, jump.Host)
		if jump.Port != 0 && jump.Port != 22 {
			target = fmt.Sprintf("%s:%d", target, jump.Port)
		}
		parts = append(parts, "-J", shellQuote(target))
	}

	parts = append(parts, fmt.Sprintf("%s@%s", shellQuote(s.User), shellQuote(s.Host)))
	return strings.Join(parts, " ")
}
