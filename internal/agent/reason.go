package agent

import (
	"strings"
	"unicode"
)

// maxLabelRunes truncates names shown in the macOS prompt.
const maxLabelRunes = 64

// ConfirmReason is the text macOS shows after "Zish is trying to", e.g.
// `use the SSH key "work" for ssh in Ghostty → prod-db`.
func ConfirmReason(req ConfirmRequest) string {
	var b strings.Builder
	b.WriteString(`use the SSH key "` + Label(req.KeyName) + `" for ` + clientLabel(req.Client))
	if req.Destination != "" {
		b.WriteString(" → " + Label(req.Destination))
	} else if req.Client.InProcess && req.Client.Destination != "" {
		b.WriteString(" → " + Label(req.Client.Destination))
	}
	if req.Forwarded {
		b.WriteString(" (forwarded agent)")
	}
	return b.String()
}

func clientLabel(c ClientInfo) string {
	if c.InProcess {
		if c.Purpose == "" {
			return "Zish"
		}
		return "Zish " + Label(c.Purpose)
	}
	name := Label(c.Name)
	if name == "" {
		name = "an unknown process"
	}
	if app := Label(c.App); app != "" && !strings.EqualFold(app, name) {
		return name + " in " + app
	}
	return name
}

// Label strips control characters and quotes, collapses spaces and truncates
// to 64 runes, so a key or process name cannot shape the prompt.
func Label(s string) string {
	var out []rune
	space := false
	for _, r := range s {
		switch {
		case unicode.IsControl(r), r == '"':
			continue
		case unicode.IsSpace(r):
			space = len(out) > 0
			continue
		}
		if space {
			out = append(out, ' ')
			space = false
		}
		out = append(out, r)
		if len(out) >= maxLabelRunes {
			out = append(out[:maxLabelRunes-1], '…')
			break
		}
	}
	return string(out)
}
