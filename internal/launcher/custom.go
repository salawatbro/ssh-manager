package launcher

import (
	"strings"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// ScriptPlaceholder marks where a custom terminal command takes the script.
const ScriptPlaceholder = "{script}"

const customWait = 3 * time.Second

func customError(msg string) error { return domain.NewError(domain.CodeTerminalLaunch, msg) }

// splitWords splits a command template into argv the way a POSIX shell
// splits words, without any expansion: whitespace separates, '…' is literal,
// "…" honours \" \\ \$ and \`, and a backslash outside quotes escapes the
// next character.
func splitWords(s string) ([]string, error) {
	var words []string
	var cur strings.Builder
	inWord := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == ' ' || c == '\t':
			if inWord {
				words = append(words, cur.String())
				cur.Reset()
				inWord = false
			}
		case c < 0x20 || c == 0x7f:
			return nil, customError("The custom terminal command contains a control character.")
		case c == '\'':
			end := strings.IndexByte(s[i+1:], '\'')
			if end < 0 {
				return nil, customError("The custom terminal command has an unclosed ' quote.")
			}
			cur.WriteString(s[i+1 : i+1+end])
			i += end + 1
			inWord = true
		case c == '"':
			i++
			for ; i < len(s) && s[i] != '"'; i++ {
				if s[i] == '\\' && i+1 < len(s) && strings.IndexByte("\"\\$`", s[i+1]) >= 0 {
					i++
				}
				cur.WriteByte(s[i])
			}
			if i >= len(s) {
				return nil, customError(`The custom terminal command has an unclosed " quote.`)
			}
			inWord = true
		case c == '\\':
			if i+1 >= len(s) {
				return nil, customError("The custom terminal command ends with a lone backslash.")
			}
			i++
			cur.WriteByte(s[i])
			inWord = true
		default:
			cur.WriteByte(c)
			inWord = true
		}
	}
	if inWord {
		words = append(words, cur.String())
	}
	return words, nil
}

// CustomCommand turns the user's template into argv, executed without a
// shell. Every {script} is replaced by the (shell-safe) script path.
func CustomCommand(template, script string) ([]string, error) {
	if strings.TrimSpace(template) == "" {
		return nil, customError("Set a custom terminal command in Settings.")
	}
	words, err := splitWords(template)
	if err != nil {
		return nil, err
	}
	found := false
	for i, w := range words {
		if strings.Contains(w, ScriptPlaceholder) {
			found = true
			words[i] = strings.ReplaceAll(w, ScriptPlaceholder, script)
		}
	}
	if !found {
		return nil, customError("The custom terminal command must contain {script}.")
	}
	return words, nil
}

// CustomAttempt wraps a custom command: a process still running after a few
// seconds (a terminal binary started directly) counts as opened.
func CustomAttempt(argv []string) Attempt {
	return Attempt{Argv: argv, Wait: customWait, KeepRunning: true}
}
