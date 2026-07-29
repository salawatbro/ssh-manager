#ifndef SSHMGR_EDIT_NATIVE_H
#define SSHMGR_EDIT_NATIVE_H

// Performs AppKit's standard paste: action, the same one the Edit menu's
// Paste item is backed by. Going through the responder chain is what keeps
// macOS from showing its pasteboard-privacy prompt: that gate is on
// programmatic NSPasteboard reads, not on a real paste command.
void sshmgrSendPaste(void);

#endif
