package domain

import "strings"

// MatchesDangerous reports whether cmd contains any dangerous pattern
// (case-sensitive substring). Blank patterns are ignored so an empty/whitespace
// pattern set never matches everything. This is an ERGONOMIC filter, not a
// security control (FR-14.9) — substring matching is deliberately simple and
// bypassable (quoting, history recall, base64).
func MatchesDangerous(cmd string, patterns []string) bool {
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.Contains(cmd, p) {
			return true
		}
	}
	return false
}

// SplitPatterns turns the newline-separated Settings.GuardPatterns into a slice,
// dropping blank lines.
func SplitPatterns(s string) []string {
	var out []string
	for _, line := range strings.Split(s, "\n") {
		if strings.TrimSpace(line) != "" {
			out = append(out, line)
		}
	}
	return out
}
