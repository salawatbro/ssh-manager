#ifndef SSHMGR_HOTKEY_DARWIN_H
#define SSHMGR_HOTKEY_DARWIN_H
#define SSHMGR_MAX_HOTKEYS 64
void sshmgrRegisterGlobalHotkey(void);
int sshmgrRegisterHotkey(int id, int keyCode, int modifiers);
void sshmgrUnregisterHotkey(int id);
#endif
