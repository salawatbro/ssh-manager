#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include "biometric_native.h"

int sshmgrBiometricAvailable(void) {
  LAContext *ctx = [[LAContext alloc] init];
  NSError *err = nil;
  BOOL ok = [ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&err];
  return ok ? 1 : 0;
}

int sshmgrBiometricAuthenticate(const char *reason) {
  LAContext *ctx = [[LAContext alloc] init];
  NSError *err = nil;
  if (![ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&err]) {
    return 0;
  }
  // evaluatePolicy's reply is async; block the calling goroutine (a Wails
  // service goroutine, never the main thread) on a semaphore until it fires.
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  __block BOOL result = NO;
  NSString *r = [NSString stringWithUTF8String:reason];
  [ctx evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
      localizedReason:r
                reply:^(BOOL success, NSError *replyErr) {
                  result = success;
                  dispatch_semaphore_signal(sem);
                }];
  dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
  return result ? 1 : 0;
}

int sshmgrDeviceOwnerAuthenticate(const char *reason, int timeoutSecs) {
  LAContext *ctx = [[LAContext alloc] init];
  NSError *err = nil;
  if (![ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&err]) {
    return -1;
  }
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  __block BOOL result = NO;
  NSString *r = [NSString stringWithUTF8String:reason];
  [ctx evaluatePolicy:LAPolicyDeviceOwnerAuthentication
      localizedReason:r
                reply:^(BOOL success, NSError *replyErr) {
                  result = success;
                  dispatch_semaphore_signal(sem);
                }];
  dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)timeoutSecs * NSEC_PER_SEC);
  if (dispatch_semaphore_wait(sem, deadline) != 0) {
    // Timed out: dismiss the prompt, then wait for its (failed) reply so the
    // block never outlives this frame's state.
    [ctx invalidate];
    dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
    return 0;
  }
  return result ? 1 : 0;
}
