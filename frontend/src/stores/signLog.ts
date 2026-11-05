import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentSignEvent } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { prependEvent } from '../lib/signLog'
import { toastError } from './toasts'

const LIMIT = 500

// The agent's sign log: loaded once, then kept live by agent:sign.
interface SignLogState {
  events: AgentSignEvent[]
  load: () => Promise<void>
  clear: () => Promise<void>
  listen: () => () => void
}

export const useSignLog = create<SignLogState>((set) => ({
  events: [],

  load: async () => {
    try {
      set({ events: (await AgentService.SignLog(LIMIT)) ?? [] })
    } catch {
      // keep what we have; the log is an aid, not a record
    }
  },

  clear: async () => {
    try {
      await AgentService.ClearSignLog()
      set({ events: [] })
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  listen: () =>
    Events.On('agent:sign', (ev) => {
      set((s) => ({ events: prependEvent(s.events, ev.data as AgentSignEvent, LIMIT) }))
    }),
}))
