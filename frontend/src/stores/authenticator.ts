import { create } from 'zustand'
import { ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { TOTPCodeView } from '@bindings/github.com/salawat/sshmgr/internal/service'

// Authenticator panel (Task 2): a read-only list of every server's current
// TOTP code (Task 1's ServerService.TOTPCodes — SEC-01, the view never
// carries the secret). Mirrors the other overlay stores' open/hide shape
// (guard.ts, snippets.ts).
interface AuthState {
  open: boolean
  codes: TOTPCodeView[]
  // Opens the panel and loads the current codes.
  show: () => Promise<void>
  // Closes and clears codes, so a stale code never lingers in memory/state
  // after the panel is dismissed.
  hide: () => void
  // Re-fetches without touching `open` — called by AuthenticatorPanel every
  // time the shared 30s countdown rolls over, so the list stays live while
  // the panel is up.
  refresh: () => Promise<void>
}

export const useAuthenticator = create<AuthState>((set) => ({
  open: false,
  codes: [],

  show: async () => {
    set({ open: true })
    const codes = (await ServerService.TOTPCodes().catch(() => [])) ?? []
    set({ codes })
  },

  hide: () => set({ open: false, codes: [] }),

  refresh: async () => {
    const codes = (await ServerService.TOTPCodes().catch(() => [])) ?? []
    set({ codes })
  },
}))
