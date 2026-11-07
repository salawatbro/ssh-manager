package main

import (
	"strings"
	"sync"

	"github.com/salawat/sshmgr/internal/domain"
)

// Hot-key ids: 1 is the ⌘⇧S window toggle, 2 the launcher, stacks take the
// rest up to SSHMGR_MAX_HOTKEYS in hotkey_darwin.h.
const (
	toggleHotkeyID   = 1
	launcherHotkeyID = 2
	firstStackHotkey = 3
	maxHotkeys       = 64
)

// carbonModifiers are Carbon's cmdKey, shiftKey, optionKey and controlKey.
var carbonModifiers = map[string]uint32{"cmd": 1 << 8, "shift": 1 << 9, "alt": 1 << 11, "ctrl": 1 << 12}

// carbonKeys are the kVK_ANSI_* virtual key codes: key positions on an ANSI
// keyboard, so ⌥⌘1 is the 1 key whatever the layout prints on it.
var carbonKeys = map[string]uint32{
	"a": 0x00, "s": 0x01, "d": 0x02, "f": 0x03, "h": 0x04, "g": 0x05, "z": 0x06, "x": 0x07,
	"c": 0x08, "v": 0x09, "b": 0x0B, "q": 0x0C, "w": 0x0D, "e": 0x0E, "r": 0x0F, "y": 0x10,
	"t": 0x11, "1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15, "6": 0x16, "5": 0x17, "9": 0x19,
	"7": 0x1A, "8": 0x1C, "0": 0x1D, "o": 0x1F, "u": 0x20, "i": 0x22, "p": 0x23, "l": 0x25,
	"j": 0x26, "k": 0x28, "n": 0x2D, "m": 0x2E, domain.ShortcutSpace: 0x31,
}

// carbonShortcut turns a canonical stack shortcut ("alt+cmd+1") into a Carbon
// key code and modifier mask.
func carbonShortcut(sc string) (key, mods uint32, ok bool) {
	if sc == "" {
		return 0, 0, false
	}
	for part := range strings.SplitSeq(sc, "+") {
		if m, isMod := carbonModifiers[part]; isMod {
			mods |= m
			continue
		}
		k, found := carbonKeys[part]
		if !found || ok {
			return 0, 0, false
		}
		key, ok = k, true
	}
	return key, mods, ok && mods != 0
}

// stackHotkeys keeps the global shortcuts of the stacks registered and maps
// a pressed hot-key id back to its stack.
type stackHotkeys struct {
	mu         sync.Mutex
	ids        map[int]string // hot-key id → stack id
	register   func(id int, key, mods uint32) bool
	unregister func(id int)
}

var stackKeys = &stackHotkeys{register: registerHotkey, unregister: unregisterHotkey}

// onStackHotkey launches a stack; set in main once the stack service exists.
var onStackHotkey func(stackID string)

// sync replaces every stack hot key with the shortcuts of stacks; it returns
// the names of stacks whose shortcut another app already holds, or the
// launcher (reserved). Main thread only, like every Carbon hot-key call.
func (h *stackHotkeys) sync(stacks []domain.Stack, reserved string) (taken []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for id := range h.ids {
		h.unregister(id)
	}
	h.ids = map[int]string{}
	next := firstStackHotkey
	for _, st := range stacks {
		key, mods, ok := carbonShortcut(st.Shortcut)
		if !ok || len(st.Steps) == 0 || next >= maxHotkeys {
			continue
		}
		if st.Shortcut == reserved || !h.register(next, key, mods) {
			taken = append(taken, st.Name)
			continue
		}
		h.ids[next] = st.ID
		next++
	}
	return taken
}

func (h *stackHotkeys) stackFor(id int) (string, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	sid, ok := h.ids[id]
	return sid, ok
}

// launcherHotkey keeps the launcher's global shortcut registered.
type launcherHotkey struct {
	mu sync.Mutex
	// want is the shortcut from Settings; taken is true when another app
	// holds it.
	want       string
	taken      bool
	register   func(id int, key, mods uint32) bool
	unregister func(id int)
}

var launcherKey = &launcherHotkey{register: registerHotkey, unregister: unregisterHotkey}

// onLauncherHotkey shows or hides the launcher; set in main.
var onLauncherHotkey func()

// set registers the launcher's shortcut ("" = off) in place of the old one.
// Main thread only.
func (h *launcherHotkey) set(sc string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.unregister(launcherHotkeyID)
	h.want, h.taken = sc, false
	if key, mods, ok := carbonShortcut(sc); ok {
		h.taken = !h.register(launcherHotkeyID, key, mods)
	}
}

func (h *launcherHotkey) state() (want string, taken bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.want, h.taken
}

// hotkeyFired dispatches a pressed hot key; it runs in its own goroutine.
func hotkeyFired(id int) {
	switch id {
	case toggleHotkeyID:
		if onGlobalHotkey != nil {
			onGlobalHotkey()
		}
		return
	case launcherHotkeyID:
		if onLauncherHotkey != nil {
			onLauncherHotkey()
		}
		return
	}
	if sid, ok := stackKeys.stackFor(id); ok && onStackHotkey != nil {
		onStackHotkey(sid)
	}
}
