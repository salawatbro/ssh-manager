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
	if l := req.Launch; l != nil {
		keys := make([]string, 0, len(l.Keys))
		for _, k := range l.Keys {
			keys = append(keys, `"`+Label(k)+`"`)
		}
		return `open the stack "` + Label(l.Stack) + `" and use the SSH keys ` + strings.Join(keys, ", ") + " for one minute"
	}
	var b strings.Builder
	b.WriteString(`use the SSH key "` + Label(req.KeyName) + `" for ` + clientLabel(req.Client))
	if req.Destination != "" {
		b.WriteString(" → " + Label(req.Destination))
	}
	if req.Forwarded {
		b.WriteString(" (forwarded agent)")
	}
	return b.String()
}

// ApprovalReason is ConfirmReason plus the approval length the user picked,
// so the system prompt names what Touch ID is about to allow.
func ApprovalReason(req ConfirmRequest, length GrantLength) string {
	switch {
	case !req.Grantable:
	case length == GrantFor15Min:
		return ConfirmReason(req) + ", and again for 15 minutes"
	case length == GrantUntilLock:
		return ConfirmReason(req) + ", and again until Zish locks"
	}
	return ConfirmReason(req)
}

// chainLabel is what an approval shows under its app: "ssh ← zsh".
func chainLabel(c ClientInfo) string {
	if c.InProcess {
		return c.Purpose
	}
	chain := c.Chain
	if c.holderAt > 0 && c.holderAt <= len(chain) {
		chain = chain[:c.holderAt]
	}
	return strings.Join(chain, " ← ")
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

// Label strips control and format characters (bidi overrides) and quotes,
// collapses spaces and truncates to 64 runes, so a key or process name cannot
// shape the prompt.
func Label(s string) string {
	var out []rune
	space := false
	for _, r := range s {
		switch {
		case unicode.IsControl(r), unicode.Is(unicode.Cf, r), r == '"':
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
