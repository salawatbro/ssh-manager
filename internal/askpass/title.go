package askpass

import (
	"strings"
	"unicode"
)

const maxTitleRunes = 64

// SanitizeTitle makes a server name safe to put inside an OSC 0 title escape:
// no C0, C1 or DEL bytes, whitespace collapsed, at most 64 runes.
func SanitizeTitle(s string) string {
	s = strings.ToValidUTF8(s, "")
	var b strings.Builder
	n := 0
	space := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			space = b.Len() > 0
			continue
		}
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r <= 0x9f) {
			continue
		}
		if space {
			if n == maxTitleRunes-1 {
				break
			}
			b.WriteByte(' ')
			n++
			space = false
		}
		if n == maxTitleRunes {
			break
		}
		b.WriteRune(r)
		n++
	}
	return b.String()
}
