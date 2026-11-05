import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { ForwardService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { ForwardInput, TunnelRow } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Status, TrafficReport } from '@bindings/github.com/salawat/sshmgr/internal/forward'

// A forward's live state, keyed by forward id. Populated by the
// forward:status event stream (see `listen` below) and read by
// TunnelCard's status dot and toggle.
export type ForwardStatus = { state: string; detail: string; portBusy?: boolean }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface ForwardsState {
  byServer: Record<string, PortForward[]>
  statusById: Record<string, ForwardStatus>
  // Every saved tunnel, for the Tunnels page and the sidebar count.
  rows: TunnelRow[]
  // Bytes per 50 s interval, oldest first, from forward:stats.
  trafficById: Record<string, number[]>

  load: (serverID: string) => Promise<void>
  loadAll: () => Promise<void>
  // The created forward, or the backend's message.
  create: (input: ForwardInput) => Promise<PortForward | string>
  update: (input: ForwardInput) => Promise<string | null>
  remove: (id: string, serverID: string) => Promise<string | null>
  setLook: (f: PortForward, icon: string, color: string) => Promise<string | null>
  start: (id: string) => Promise<string | null>
  stop: (id: string) => Promise<string | null>
  stopAll: () => Promise<void>
  // Moves a -L/-D tunnel to a free port on this Mac and starts it.
  usePort: (id: string, port: number) => Promise<string | null>
  // listen wires the forward:status event once, at app mount, and returns an
  // unsubscribe — mirrors hostkey.ts's `listen`. Registering at mount (not
  // inside TunnelsPanel) avoids the emit-before-listener drop: Start's
  // tunnel can begin accepting, and emitting status, before any per-server
  // view happens to be mounted to hear it.
  listen: () => () => void
}

// Refreshes both lists a sheet or menu may have changed.
async function reload(get: () => ForwardsState, serverID: string) {
  await Promise.all([get().load(serverID), get().loadAll()])
}

export const useForwards = create<ForwardsState>((set, get) => ({
  byServer: {},
  statusById: {},
  rows: [],
  trafficById: {},

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

  // Seeds statuses and traffic for ids the event streams haven't reported yet:
  // auto-start can bring tunnels up before the window listens.
  loadAll: async () => {
    try {
      const rows = (await ForwardService.ListAll()) ?? []
      set((s) => {
        const statusById = { ...s.statusById }
        const trafficById = { ...s.trafficById }
        for (const r of rows) {
          const id = r.forward.id
          if (!statusById[id]) statusById[id] = { state: r.status.state, detail: r.status.detail, portBusy: r.status.portBusy }
          if (!trafficById[id]) trafficById[id] = r.traffic.buckets ?? []
        }
        return { rows, statusById, trafficById }
      })
    } catch {
      set({ rows: [] })
    }
  },

  // Mirrors servers.ts's save: unwrap .message so a RuntimeError from
  // Call.ByID doesn't leak its "RuntimeError: " prefix into the shown text,
  // and reload the server's list afterward so the new row shows up.
  create: async (input) => {
    try {
      const created = await ForwardService.Create(input)
      await reload(get, input.serverId)
      return created ?? 'The tunnel was not saved.'
    } catch (e) {
      return message(e)
    }
  },

  update: async (input) => {
    try {
      await ForwardService.Update(input)
      await reload(get, input.serverId)
      return null
    } catch (e) {
      return message(e)
    }
  },

  setLook: async (f, icon, color) => {
    try {
      await ForwardService.SetLook(f.id, icon, color)
      await reload(get, f.serverId)
      return null
    } catch (e) {
      return message(e)
    }
  },

  remove: async (id, serverID) => {
    try {
      await ForwardService.Delete(id)
      await reload(get, serverID)
      return null
    } catch (e) {
      return message(e)
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
      return message(e)
    }
  },

  stop: async (id) => {
    try {
      await ForwardService.Stop(id)
      return null
    } catch (e) {
      return message(e)
    }
  },

  stopAll: async () => {
    try {
      await ForwardService.StopAll()
    } catch {
      // Each stop reports through forward:status; nothing to add here.
    }
  },

  usePort: async (id, port) => {
    const row = get().rows.find((r) => r.forward.id === id)
    try {
      await ForwardService.UsePort(id, port)
      return null
    } catch (e) {
      return message(e)
    } finally {
      if (row) await reload(get, row.forward.serverId)
    }
  },

  listen: () => {
    const offStatus = Events.On('forward:status', (ev) => {
      const s = ev.data as Status
      set((st) => ({
        statusById: { ...st.statusById, [s.forwardId]: { state: s.state, detail: s.detail, portBusy: s.portBusy } },
      }))
    })
    const offStats = Events.On('forward:stats', (ev) => {
      const report = ev.data as TrafficReport
      const trafficById: Record<string, number[]> = {}
      for (const t of report.tunnels ?? []) trafficById[t.forwardId] = t.buckets ?? []
      set({ trafficById })
    })
    return () => {
      offStatus()
      offStats()
    }
  },
}))
