import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { ForwardService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { ForwardInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Status } from '@bindings/github.com/salawat/sshmgr/internal/forward'

// A forward's live state, keyed by forward id. Populated by the
// forward:status event stream (see `listen` below) and read by
// TunnelCard's status dot and toggle.
export type ForwardStatus = { state: string; detail: string }

interface ForwardsState {
  byServer: Record<string, PortForward[]>
  statusById: Record<string, ForwardStatus>

  load: (serverID: string) => Promise<void>
  create: (input: ForwardInput) => Promise<string | null>
  update: (input: ForwardInput) => Promise<string | null>
  remove: (id: string, serverID: string) => Promise<string | null>
  start: (id: string) => Promise<string | null>
  stop: (id: string) => Promise<string | null>
  // listen wires the forward:status event once, at app mount, and returns an
  // unsubscribe — mirrors hostkey.ts's `listen`. Registering at mount (not
  // inside TunnelsPanel) avoids the emit-before-listener drop: Start's
  // tunnel can begin accepting, and emitting status, before any per-server
  // view happens to be mounted to hear it.
  listen: () => () => void
}

export const useForwards = create<ForwardsState>((set, get) => ({
  byServer: {},
  statusById: {},

  // Best-effort like servers.ts's detectKeys: a failed load must not crash
  // the caller's useEffect — fall back to an empty list for that server so
  // TunnelsPanel still has something to render.
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

  // Mirrors remove/create: unwrap .message for the RuntimeError-prefix
  // reason. No optimistic statusById write here — the forward:status event
  // this triggers on the backend drives the real state, so a Start error is
  // just surfaced to the caller (e.g. TunnelCard's toggle) as text.
  start: async (id) => {
    try {
      await ForwardService.Start(id)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  stop: async (id) => {
    try {
      await ForwardService.Stop(id)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  listen: () =>
    Events.On('forward:status', (ev) => {
      const s = ev.data as Status
      set((st) => ({
        statusById: { ...st.statusById, [s.forwardId]: { state: s.state, detail: s.detail } },
      }))
    }),
}))
