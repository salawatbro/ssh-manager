package domain

import (
	"slices"
	"strings"
)

// ShortcutModifiers are the modifier names of a shortcut, in canonical order.
var ShortcutModifiers = []string{"ctrl", "alt", "shift", "cmd"}

// ToggleShortcut is Zish's own show/hide hot key; no stack may take it.
const ToggleShortcut = "shift+cmd+s"

// DefaultLauncherShortcut opens the launcher from any app.
const DefaultLauncherShortcut = "alt+space"

// ShortcutSpace is the Space key's name in a shortcut. Only the launcher may
// use it.
const ShortcutSpace = "space"

// ParseShortcut checks a global shortcut and returns it in canonical form:
// modifiers in ShortcutModifiers order, then one letter or digit, joined by
// "+". "" means none. A system-wide hot key must use ⌘ or ⌥ plus one more
// modifier, so it never steals a plain ⌘<key> from other apps nor plain
// Ctrl+<letter> from readline.
func ParseShortcut(s string) (string, error) {
	return parseShortcut(s, false)
}

// ParseLauncherShortcut is ParseShortcut for the launcher, which may also use
// Space; Space needs only ⌘ or ⌥ (⌥Space, like Spotlight's ⌘Space).
func ParseLauncherShortcut(s string) (string, error) {
	return parseShortcut(s, true)
}

func parseShortcut(s string, space bool) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return "", nil
	}
	bad := validationError("Use ⌘ or ⌥ with one more modifier and a letter or digit, like ⌥⌘1.")
	if space {
		bad = validationError("Use ⌘ or ⌥ with Space, or two modifiers and a letter or digit, like ⌥Space.")
	}
	mods := map[string]bool{}
	key := ""
	for part := range strings.SplitSeq(s, "+") {
		switch {
		case slices.Contains(ShortcutModifiers, part):
			if mods[part] {
				return "", bad
			}
			mods[part] = true
		case key == "" && (isShortcutKey(part) || space && part == ShortcutSpace):
			key = part
		default:
			return "", bad
		}
	}
	need := 2
	if key == ShortcutSpace {
		need = 1
	}
	if key == "" || len(mods) < need || (!mods["cmd"] && !mods["alt"]) {
		return "", bad
	}
	parts := make([]string, 0, len(mods)+1)
	for _, m := range ShortcutModifiers {
		if mods[m] {
			parts = append(parts, m)
		}
	}
	out := strings.Join(append(parts, key), "+")
	if out == ToggleShortcut {
		return "", validationError("⇧⌘S shows and hides Zish. Pick another shortcut.")
	}
	return out, nil
}

func isShortcutKey(part string) bool {
	return len(part) == 1 && (part[0] >= 'a' && part[0] <= 'z' || part[0] >= '0' && part[0] <= '9')
}
