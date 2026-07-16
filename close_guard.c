#include <Cocoa/Cocoa.h>
#include "_cgo_export.h"

// The guard forwards the red-button press to Go, which decides (based on the
// keep-in-tray setting) whether to hide the window or quit — see
// goCloseRequested in close_guard_darwin.go.
@interface SSHMgrCloseGuard : NSObject
- (void)closePressed:(id)sender;
@end
@implementation SSHMgrCloseGuard
- (void)closePressed:(id)sender {
	(void)sender;
	goCloseRequested();
}
@end

static SSHMgrCloseGuard *gCloseGuard = nil;

// sshmgrInterceptCloseButton points the main window's close button at the
// guard. Called on WindowShow (not ApplicationStarted, which is too early —
// the native window/button may not exist yet). Idempotent: it re-points the
// button every call and reuses a single guard, so it is safe to run on every
// show (and survives Wails re-applying button state). The window is matched
// by title so a stray dialog window is never picked instead.
void sshmgrInterceptCloseButton(void) {
	NSWindow *target = nil;
	for (NSWindow *w in [NSApp windows]) {
		if ([[w title] isEqualToString:@"SSH Manager"]) {
			target = w;
			break;
		}
	}
	if (target == nil) {
		target = [[NSApp windows] firstObject];
	}
	if (target == nil) {
		return;
	}
	NSButton *btn = [target standardWindowButton:NSWindowCloseButton];
	if (btn == nil) {
		return;
	}
	if (gCloseGuard == nil) {
		gCloseGuard = [[SSHMgrCloseGuard alloc] init];
	}
	[btn setTarget:gCloseGuard];
	[btn setAction:@selector(closePressed:)];
}
