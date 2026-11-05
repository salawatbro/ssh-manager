package askpass

import "strings"

// Kind is what an ssh prompt asks for.
type Kind int

// The prompt kinds Classify tells apart.
const (
	KindUnknown Kind = iota
	KindHostKey
	KindConfirm
	KindNotify
	KindPassword
	KindPassphrase
	KindKIPassword
	KindKITOTP
)

type slot int

const (
	slotNone slot = iota
	slotPassword
	slotPassphrase
	slotTOTP
)

func (k Kind) slot() slot {
	switch k {
	case KindPassword, KindKIPassword:
		return slotPassword
	case KindPassphrase:
		return slotPassphrase
	case KindKITOTP:
		return slotTOTP
	}
	return slotNone
}

const (
	passwordSuffix   = "'s password: "
	passphrasePrefix = "Enter passphrase for key '"
	passphraseSuffix = "': "
)

// Classify maps an ssh prompt to a Kind and the hops it may belong to. It
// matches the exact strings OpenSSH builds itself (user@host, key path), so
// text a server controls cannot claim to be a different hop.
func Classify(prompt, hint string, hops []Hop) (Kind, []int) {
	switch hint {
	case "confirm":
		return KindConfirm, nil
	case "none":
		return KindNotify, nil
	}
	if isHostKeyPrompt(prompt) {
		return KindHostKey, nil
	}
	if c := matchHops(hops, func(h Hop) bool { return isPasswordPrompt(prompt, h) }); len(c) > 0 {
		return KindPassword, c
	}
	if c := matchHops(hops, func(h Hop) bool { return isPassphrasePrompt(prompt, h) }); len(c) > 0 {
		return KindPassphrase, c
	}
	var rest string
	c := matchHops(hops, func(h Hop) bool {
		r, ok := kiRest(prompt, h)
		if ok {
			rest = r
		}
		return ok
	})
	if len(c) > 0 {
		return kiKind(rest), c
	}
	return classifyUnprefixed(prompt, hops)
}

// EchoFor reports whether a prompt Zish hands back to the terminal should
// show what the user types: only for yes/no style questions.
func EchoFor(k Kind, prompt string) bool {
	if k == KindHostKey || k == KindConfirm {
		return true
	}
	return strings.HasSuffix(prompt, "(yes/no): ") ||
		(strings.HasSuffix(prompt, "? ") && strings.Contains(prompt, "yes/no"))
}

func isHostKeyPrompt(p string) bool {
	return strings.Contains(p, "(yes/no") ||
		strings.Contains(p, "Are you sure you want to continue connecting") ||
		strings.HasPrefix(p, "Please type 'yes'")
}

func matchHops(hops []Hop, ok func(Hop) bool) []int {
	var out []int
	for i, h := range hops {
		if ok(h) {
			out = append(out, i)
		}
	}
	return out
}

// isUserAtHost reports s == user + "@" + host. ssh lowercases a command-line
// host, so the host part compares case-insensitively; the user does not.
func isUserAtHost(s, user, host string) bool {
	if user == "" || host == "" || !strings.HasPrefix(s, user+"@") {
		return false
	}
	return strings.EqualFold(s[len(user)+1:], host)
}

func isPasswordPrompt(p string, h Hop) bool {
	who, ok := strings.CutSuffix(p, passwordSuffix)
	if !ok {
		return false
	}
	// Older OpenSSH printed "%.30s@%.128s's password: ".
	return isUserAtHost(who, h.User, h.Host) || isUserAtHost(who, truncBytes(h.User, 30), truncBytes(h.Host, 128))
}

func isPassphrasePrompt(p string, h Hop) bool {
	if h.KeyPath == "" {
		return false
	}
	return p == passphrasePrefix+truncBytes(h.KeyPath, 100)+passphraseSuffix
}

// kiRest returns the server's text of a keyboard-interactive prompt that
// ssh prefixed with "(user@host) " for this hop.
func kiRest(p string, h Hop) (string, bool) {
	if h.User == "" || h.Host == "" || !strings.HasPrefix(p, "("+h.User+"@") {
		return "", false
	}
	tail := p[len(h.User)+2:]
	if len(tail) < len(h.Host)+2 || !strings.EqualFold(tail[:len(h.Host)], h.Host) {
		return "", false
	}
	rest, ok := strings.CutPrefix(tail[len(h.Host):], ") ")
	return rest, ok
}

// kiKind applies the same keyword rule as the in-process client's
// keyboard-interactive auto-fill: code words first, then "password".
func kiKind(text string) Kind {
	lower := strings.ToLower(text)
	for _, w := range []string{"verification", "code", "one-time", "otp", "token"} {
		if strings.Contains(lower, w) {
			return KindKITOTP
		}
	}
	if strings.Contains(lower, "password") {
		return KindKIPassword
	}
	return KindUnknown
}

// classifyUnprefixed handles keyboard-interactive prompts from ssh older
// than 8.4, which carry no "(user@host)" prefix. Without the prefix any
// server in a chain could ask, so it answers only single-hop launches.
func classifyUnprefixed(p string, hops []Hop) (Kind, []int) {
	if len(hops) != 1 || strings.HasPrefix(p, "(") || strings.HasSuffix(p, passwordSuffix) ||
		strings.HasPrefix(p, "Enter PIN for ") || strings.HasPrefix(p, "Enter passphrase") ||
		strings.HasPrefix(p, "Confirm user presence") {
		return KindUnknown, nil
	}
	k := kiKind(p)
	if k == KindUnknown || !hops[0].has(k.slot()) {
		return KindUnknown, nil
	}
	return k, []int{0}
}

func truncBytes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
