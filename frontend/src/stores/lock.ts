import { create } from 'zustand'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { BiometricService } from '@bindings/github.com/salawat/sshmgr'

export type LockReason = 'manual' | 'idle'

interface LockState {
  locked: boolean
  hasPin: boolean
  biometricsAvailable: boolean
  // Why and when the lock engaged ('' / 0 while unlocked); the lock screen
  // says so. Sleep and launch locks come from the backend's Status.
  reason: string
  since: number
  refresh: () => Promise<void>
  lock: (reason: LockReason) => void
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
  reason: '',
  since: 0,

  async refresh() {
    const [hasPin, biometricsAvailable] = await Promise.all([
      LockService.HasPin(),
      BiometricService.Available(),
    ])
    set({ hasPin, biometricsAvailable })
  },

  // Engaging the lock only makes sense with a PIN set — otherwise there is no
  // way back in. Callers (⌘L, idle) rely on this guard.
  lock(reason) {
    if (!get().hasPin) return
    if (!get().locked) set({ locked: true, reason, since: Date.now() })
    void LockService.Lock(reason).catch(() => {})
  },

  // Only after the backend accepted the PIN (VerifyPin unlocks its gate).
  unlock() {
    set({ locked: false, reason: '', since: 0 })
  },

  async unlockWithBiometrics(reason) {
    const ok = await LockService.UnlockWithBiometrics(reason)
    if (ok) set({ locked: false, reason: '', since: 0 })
    return ok
  },

  // Follows the backend (boot, lock:changed); a lock this window did not
  // start reads its reason from the backend.
  setLocked(v) {
    if (!v) {
      set({ locked: false, reason: '', since: 0 })
      return
    }
    if (!get().locked) set({ locked: true })
    void LockService.Status()
      .then((st) => {
        if (st.locked && get().locked) set({ reason: st.reason, since: st.since })
      })
      .catch(() => {})
  },
}))
