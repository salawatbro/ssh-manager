import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Grant } from '@bindings/github.com/salawat/sshmgr/internal/agent'
import { toastError } from './toasts'

// Open approvals: loaded once, then kept live by agent:grants (sent on open,
// revoke and lock; expiry is filtered on the client).
interface GrantsState {
  grants: Grant[]
  load: () => Promise<void>
  revoke: (id: string) => Promise<void>
  listen: () => () => void
}

export const useGrants = create<GrantsState>((set) => ({
  grants: [],

  load: async () => {
    try {
      set({ grants: (await AgentService.Grants()) ?? [] })
    } catch {
      // the list is an aid; the backend still enforces every approval
    }
  },

  revoke: async (id) => {
    set((s) => ({ grants: s.grants.filter((g) => g.id !== id) }))
    try {
      await AgentService.RevokeGrant(id)
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  listen: () =>
    Events.On('agent:grants', (ev) => {
      set({ grants: (ev.data as Grant[] | null) ?? [] })
    }),
}))
