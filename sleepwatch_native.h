#ifndef SSHMGR_SLEEPWATCH_NATIVE_H
#define SSHMGR_SLEEPWATCH_NATIVE_H

// Starts watching for the Mac going to sleep, its display sleeping, the
// screen locking and a switch to another user; calls goAwayFromMac() for
// each. Idempotent.
void sshmgrStartSleepWatch(void);

#endif
