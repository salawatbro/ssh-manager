#ifndef SSHMGR_APPS_NATIVE_H
#define SSHMGR_APPS_NATIVE_H

// Looks up an installed app by bundle id through LaunchServices. Returns 1 and
// sets *path and *version (malloc'd, caller frees) when found, else 0.
int sshmgrLocateApp(const char *bundleID, char **path, char **version);

#endif
