package domain

import (
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// IconIDs are the built-in glyphs a server or tunnel icon tile can show. The
// frontend's lib/look.ts holds the same list; a vitest reads this declaration.
var IconIDs = []string{"server", "database", "globe", "cloud", "box", "layers", "shield", "rocket", "cpu", "terminal", "code", "git", "chart", "monitor", "mail", "inbox", "search", "lock", "plug", "wifi", "home", "flask", "bolt", "star"}

// TintNames are the colours an icon tile can be tinted with.
var TintNames = []string{"gray", "red", "orange", "amber", "lime", "green", "teal", "sky", "blue", "violet", "pink", "fuchsia"}

// IconLettersPrefix marks an icon drawn from the user's own letters or emoji.
const IconLettersPrefix = "letters:"

// MaxIconLetters caps the runes after IconLettersPrefix.
const MaxIconLetters = 8

// validateLook trims icon and color in place, then checks them. Empty means
// letters from the name and an automatic colour.
func validateLook(icon, color *string) error {
	*icon = strings.TrimSpace(*icon)
	*color = strings.TrimSpace(*color)
	if !validIcon(*icon) {
		return validationError("Choose an icon from the list, or up to 8 letters or emoji.")
	}
	if *color != "" && !slices.Contains(TintNames, *color) {
		return validationError("Choose a colour from the list.")
	}
	return nil
}

func validIcon(icon string) bool {
	if icon == "" || slices.Contains(IconIDs, icon) {
		return true
	}
	letters, ok := strings.CutPrefix(icon, IconLettersPrefix)
	if !ok || !utf8.ValidString(letters) {
		return false
	}
	if n := utf8.RuneCountInString(letters); n < 1 || n > MaxIconLetters {
		return false
	}
	for _, r := range letters {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}
