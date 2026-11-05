import { create } from 'zustand'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { BiometricService } from '@bindings/github.com/salawat/sshmgr'

interface LockState {
  locked: boolean
  hasPin: boolean
  biometricsAvailable: boolean
  refresh: () => Promise<void>
  lock: () => void
  unlock: () => void
  unlockWithBiometrics: (reason: string) => Promise<boolean>
  setLocked: (v: boolean) => void
}

// Lock state for the whole app. The backend owns the truth (LockService's gate:
// locking it also revokes every terminal auto-fill); `locked` mirrors it for
// the LockOverlay. `hasPin` and `biometricsAvailable` are read at boot and
// after the PIN is set/removed.
export const useLock = create<LockState>((set, get) => ({
  locked: false,
  hasPin: false,
  biometricsAvailable: false,

  async refresh() {
    const [hasPin, biometricsAvailable] = await Promise.all([
      LockService.HasPin(),
      BiometricService.Available(),
    ])
    set({ hasPin, biometricsAvailable })
  },

  // Engaging the lock only makes sense with a PIN set — otherwise there is no
  // way back in. Callers (⌘L, idle) rely on this guard.
  lock() {
    if (!get().hasPin) return
    set({ locked: true })
    void LockService.Lock().catch(() => {})
  },

  // Only after the backend accepted the PIN (VerifyPin unlocks its gate).
  unlock() {
    set({ locked: false })
  },

  async unlockWithBiometrics(reason) {
    const ok = await LockService.UnlockWithBiometrics(reason)
    if (ok) set({ locked: false })
    return ok
  },

  setLocked(v) {
    set({ locked: v })
  },
}))
