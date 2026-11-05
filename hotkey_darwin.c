#include <Carbon/Carbon.h>
#include "_cgo_export.h"
#include "hotkey_darwin.h"

static const OSType sshmgrHotkeySignature = 'sshm';
static EventHotKeyRef sshmgrHotkeys[SSHMGR_MAX_HOTKEYS];
static Boolean sshmgrHandlerInstalled = false;

// sshmgrHotkeyHandler runs on the main run loop — Carbon dispatches hot-key
// events on the same loop Wails pumps — and hands the pressed id to Go, which
// does the work in a goroutine.
static OSStatus sshmgrHotkeyHandler(EventHandlerCallRef next, EventRef ev, void *ud) {
	(void)next; (void)ud;
	EventHotKeyID hk;
	if (GetEventParameter(ev, kEventParamDirectObject, typeEventHotKeyID, NULL, sizeof(hk), NULL, &hk) != noErr ||
	    hk.signature != sshmgrHotkeySignature) {
		return eventNotHandledErr;
	}
	goHotkeyFired((int)hk.id);
	return noErr;
}

static void sshmgrInstallHandler(void) {
	if (sshmgrHandlerInstalled) {
		return;
	}
	EventTypeSpec spec;
	spec.eventClass = kEventClassKeyboard;
	spec.eventKind = kEventHotKeyPressed;
	InstallApplicationEventHandler(NewEventHandlerUPP(sshmgrHotkeyHandler), 1, &spec, NULL, NULL);
	sshmgrHandlerInstalled = true;
}

// sshmgrRegisterHotkey installs a system-wide hot key under id (1 is the
// ⌘⇧S window toggle), replacing whatever that id held. Carbon
// RegisterEventHotKey needs no Accessibility permission and fires even when
// the app is not frontmost. Returns the Carbon status: another app holding
// the same combination fails with eventHotKeyExistsErr. Main thread only.
int sshmgrRegisterHotkey(int id, int keyCode, int modifiers) {
	if (id < 1 || id >= SSHMGR_MAX_HOTKEYS) {
		return paramErr;
	}
	sshmgrInstallHandler();
	sshmgrUnregisterHotkey(id);
	EventHotKeyID hkID;
	hkID.signature = sshmgrHotkeySignature;
	hkID.id = (UInt32)id;
	return RegisterEventHotKey((UInt32)keyCode, (UInt32)modifiers, hkID, GetApplicationEventTarget(), 0, &sshmgrHotkeys[id]);
}

void sshmgrUnregisterHotkey(int id) {
	if (id < 1 || id >= SSHMGR_MAX_HOTKEYS || sshmgrHotkeys[id] == NULL) {
		return;
	}
	UnregisterEventHotKey(sshmgrHotkeys[id]);
	sshmgrHotkeys[id] = NULL;
}

void sshmgrRegisterGlobalHotkey(void) {
	sshmgrRegisterHotkey(1, kVK_ANSI_S, cmdKey | shiftKey);
}
