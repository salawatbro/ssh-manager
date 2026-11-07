#import <AppKit/AppKit.h>
#include "_cgo_export.h"
#include "sleepwatch_native.h"

static BOOL gWatching = NO;

void sshmgrStartSleepWatch(void) {
  if (gWatching) {
    return;
  }
  gWatching = YES;
  void (^away)(NSNotification *) = ^(NSNotification *note) {
    goAwayFromMac();
  };
  NSNotificationCenter *ws = [[NSWorkspace sharedWorkspace] notificationCenter];
  [ws addObserverForName:NSWorkspaceWillSleepNotification object:nil queue:nil usingBlock:away];
  [ws addObserverForName:NSWorkspaceScreensDidSleepNotification object:nil queue:nil usingBlock:away];
  [ws addObserverForName:NSWorkspaceSessionDidResignActiveNotification object:nil queue:nil usingBlock:away];
  // The screen lock has no NSWorkspace notification; loginwindow posts this one.
  [[NSDistributedNotificationCenter defaultCenter] addObserverForName:@"com.apple.screenIsLocked"
                                                               object:nil
                                                                queue:nil
                                                           usingBlock:away];
}
