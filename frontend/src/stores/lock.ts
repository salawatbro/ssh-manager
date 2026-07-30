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
  setLocked: (v: boolean) => void
}

// Lock state for the whole app. `locked` drives the LockOverlay; `hasPin` and
// `biometricsAvailable` are read from the backend at boot (and after the PIN is
// set/removed) so the settings UI and the overlay show the right affordances.
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
  // way back in. Callers (⌘L, idle, boot) rely on this guard.
  lock() {
    if (get().hasPin) set({ locked: true })
  },

  unlock() {
    set({ locked: false })
  },

  setLocked(v) {
    set({ locked: v })
  },
}))
