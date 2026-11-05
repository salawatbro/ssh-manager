#import <AppKit/AppKit.h>
#include <stdlib.h>
#include <string.h>
#include "apps_native.h"

int sshmgrLocateApp(const char *bundleID, char **path, char **version) {
  @autoreleasepool {
    NSString *bid = [NSString stringWithUTF8String:bundleID];
    if (bid == nil) {
      return 0;
    }
    NSURL *url = [[NSWorkspace sharedWorkspace] URLForApplicationWithBundleIdentifier:bid];
    if (url == nil) {
      return 0;
    }
    id v = [[NSBundle bundleWithURL:url] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
    *path = strdup([[url path] fileSystemRepresentation]);
    *version = strdup([v isKindOfClass:[NSString class]] ? [(NSString *)v UTF8String] : "");
    return 1;
  }
}
