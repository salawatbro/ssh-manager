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
