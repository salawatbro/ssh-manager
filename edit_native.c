#import <Cocoa/Cocoa.h>
#include "edit_native.h"

void sshmgrSendPaste(void) {
  // AppKit is main-thread only, and the caller arrives on a Wails service
  // goroutine. Same rule the tray menu learned the hard way.
  dispatch_async(dispatch_get_main_queue(), ^{
    // to:nil walks the responder chain, so the paste lands wherever the focus
    // is — the WKWebView, and from there the terminal's hidden textarea.
    [NSApp sendAction:@selector(paste:) to:nil from:nil];
  });
}
