import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { HostKeyRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface HostKeyState {
  request: HostKeyRequest | null
  confirm: (accept: boolean) => Promise<void>
  listen: () => () => void
}

export const useHostKey = create<HostKeyState>((set, get) => ({
  request: null,

  confirm: async (accept) => {
    const req = get().request
    if (!req) return
    set({ request: null })
    // Fire-and-forget the verdict; the blocked TestConnection call resolves
    // on the backend. Errors here are stale-click races — safe to ignore.
    await SSHService.ConfirmHostKey(req.requestID, accept).catch(() => {})
  },

  // listen wires the event once, at app mount, and returns an unsubscribe.
  // Registering here (not inside a modal) avoids the emit-before-listener
  // drop: the backend may emit hostkey:request the instant a test starts.
  listen: () =>
    Events.On('hostkey:request', (ev) => {
      set({ request: ev.data })
    }),
}))
