#ifndef SSHMGR_BIOMETRIC_NATIVE_H
#define SSHMGR_BIOMETRIC_NATIVE_H

// Returns 1 when the device can evaluate a biometric policy (Touch ID present
// and enrolled), 0 otherwise.
int sshmgrBiometricAvailable(void);

// Presents the biometric prompt with the given localized reason and blocks
// until the user responds. Returns 1 on success, 0 on failure or cancel.
int sshmgrBiometricAuthenticate(const char *reason);

#endif
