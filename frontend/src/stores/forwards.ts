import { create } from 'zustand'
import { ForwardService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { ForwardInput } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface ForwardsState {
  byServer: Record<string, PortForward[]>

  load: (serverID: string) => Promise<void>
  create: (input: ForwardInput) => Promise<string | null>
  update: (input: ForwardInput) => Promise<string | null>
  remove: (id: string, serverID: string) => Promise<string | null>
}

export const useForwards = create<ForwardsState>((set, get) => ({
  byServer: {},

  // Best-effort like servers.ts's detectKeys: a failed load must not crash
  // the caller's useEffect — fall back to an empty list for that server so
  // ForwardEditor still has something to render.
  load: async (serverID) => {
    try {
      const list = (await ForwardService.List(serverID)) ?? []
      set((s) => ({ byServer: { ...s.byServer, [serverID]: list } }))
    } catch {
      set((s) => ({ byServer: { ...s.byServer, [serverID]: [] } }))
    }
  },

  // Mirrors servers.ts's save: unwrap .message so a RuntimeError from
  // Call.ByID doesn't leak its "RuntimeError: " prefix into the shown text,
  // and reload the server's list afterward so the new row shows up.
  create: async (input) => {
    try {
      await ForwardService.Create(input)
      await get().load(input.serverId)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  update: async (input) => {
    try {
      await ForwardService.Update(input)
      await get().load(input.serverId)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  remove: async (id, serverID) => {
    try {
      await ForwardService.Delete(id)
      await get().load(serverID)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },
}))
