#include <Carbon/Carbon.h>
#include "_cgo_export.h"

// sshmgrHotkeyHandler runs on the main run loop — Carbon dispatches hot-key
// events on the same loop Wails pumps — and calls back into Go, which runs the
// window toggle in a goroutine so Wails can marshal it to the main thread.
static OSStatus sshmgrHotkeyHandler(EventHandlerCallRef next, EventRef ev, void *ud) {
	(void)next; (void)ev; (void)ud;
	goGlobalHotkeyFired();
	return noErr;
}

// sshmgrRegisterGlobalHotkey installs a SYSTEM-WIDE ⌘⇧S hot key. Carbon
// RegisterEventHotKey needs no Accessibility permission and fires even when the
// app is not frontmost — the "system-wide" show/hide the design asks for.
// kVK_ANSI_S is the 'S' key; cmdKey|shiftKey is ⌘⇧. Deprecated-but-functional
// on modern macOS incl. Apple Silicon; this is how menu-bar apps do it.
void sshmgrRegisterGlobalHotkey(void) {
	EventTypeSpec spec;
	spec.eventClass = kEventClassKeyboard;
	spec.eventKind = kEventHotKeyPressed;
	InstallApplicationEventHandler(NewEventHandlerUPP(sshmgrHotkeyHandler), 1, &spec, NULL, NULL);

	EventHotKeyID hkID;
	hkID.signature = 'sshm';
	hkID.id = 1;
	EventHotKeyRef ref;
	RegisterEventHotKey(kVK_ANSI_S, cmdKey | shiftKey, hkID, GetApplicationEventTarget(), 0, &ref);
}
