import { create } from 'zustand'
import { ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
// Server and CreateServerInput are generated interfaces — type-only.
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput, TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { toastError } from './toasts'

interface ServersState {
  servers: Server[]
  loading: boolean
  error: string | null
  selectedId: string | null

  load: () => Promise<void>
  save: (id: string | null, input: CreateServerInput) => Promise<string | null>
  remove: (id: string) => Promise<string | null>
  duplicate: (id: string) => Promise<string | null>
  copySSHCommand: (id: string) => Promise<void>
  setPinned: (id: string, pinned: boolean) => Promise<void>
  select: (id: string | null) => void
  detectKeys: () => Promise<KeyInfo[]>
  testConnection: (id: string) => Promise<TestResult | null>
}

export const useServers = create<ServersState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  selectedId: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      // List returns Server[] | null — GORM hands back a nil slice when the
      // table is empty, and that crosses the binding as null.
      const servers = (await ServerService.List()) ?? []
      set({ servers, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  save: async (id, input) => {
    try {
      id ? await ServerService.Update(id, input) : await ServerService.Create(input)
      await get().load()
      return null
    } catch (e) {
      // The backend returns a domain.Error whose message is already written
      // for the user (TZ 11.1) — show it as-is rather than inventing one.
      // Call.ByID rejects with a RuntimeError (extends Error), so a bare
      // String(e) would prefix the message with "RuntimeError: "; unwrap
      // .message to keep only the backend's text.
      return e instanceof Error ? e.message : String(e)
    }
  },

  remove: async (id) => {
    try {
      await ServerService.Delete(id)
      if (get().selectedId === id) set({ selectedId: null })
      await get().load()
      return null
    } catch (e) {
      // Mirror `save`: unwrap .message so a RuntimeError from Call.ByID
      // doesn't leak its "RuntimeError: " prefix into the shown text, and
      // return the backend's message (TZ 11.1) to the caller instead of
      // only stashing it in `error`, which nothing renders.
      return e instanceof Error ? e.message : String(e)
    }
  },

  // FR-01.4. Mirrors `remove`: unwrap .message for the same RuntimeError
  // reason, and refresh the list so the copy shows up right away.
  duplicate: async (id) => {
    try {
      await ServerService.Duplicate(id)
      await get().load()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  // Tray quick-connect: pin/unpin, then reload so the row indicator and the
  // menu-bar list both reflect it. A cap error (6th pin) has no inline surface
  // — the pin lives in a context menu that's gone by the time this settles —
  // so it surfaces as a toast. Unwrap .message like `save` does, so the
  // RuntimeError prefix never reaches the shown text.
  setPinned: async (id, pinned) => {
    try {
      await ServerService.SetPinned(id, pinned)
      await get().load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  // FR-01.9. navigator.clipboard is local, not a network call (SEC-09 is
  // about outbound network) — no store state to update, the store is just
  // where the other server-scoped backend calls already live.
  //
  // Best-effort: the call site is fire-and-forget (`void copySSHCommand(...)`
  // in ServerContextMenu), and both ServerService.SSHCommand (e.g. the row
  // was deleted between the right-click and the click — ERR_NOT_FOUND) and
  // navigator.clipboard.writeText (e.g. the window is unfocused, or the
  // permission is denied) can reject. Swallow either failure silently rather
  // than let it surface as an unhandled promise rejection — there is no UI
  // affordance here to show an error against anyway.
  copySSHCommand: async (id) => {
    try {
      const cmd = await ServerService.SSHCommand(id)
      await navigator.clipboard.writeText(cmd)
    } catch {
      // silent — copy is best-effort
    }
  },

  select: (id) => set({ selectedId: id }),

  // Key detection is best-effort (FR-02.5): a scan failure must not block
  // the form — the manual path picker in ServerFormKey still works.
  detectKeys: async () => {
    try {
      return (await ServerService.DetectKeys()) ?? []
    } catch {
      return []
    }
  },

  // A connection outcome (refused, timed out, auth failed, host key
  // declined, keychain locked) comes back as a normal ok:false TestResult —
  // only a missing server id throws. Surface that thrown case as a
  // synthetic failed result so the strip always has something to render.
  testConnection: async (id) => {
    try {
      return await ServerService.TestConnection(id)
    } catch (e) {
      return {
        ok: false,
        latencyMs: 0,
        banner: '',
        code: 'ERR_NOT_FOUND',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
}))

// FR-01.5. Servers arrive already ordered by group from the backend, so this
// only has to fold them into runs — no sorting here, or the two orderings
// could drift apart.
//
// Fold on the RAW s.group, not on a display label. `group` is free text
// (internal/domain/validate.go only trims it — nothing forbids a server
// literally named "Ungrouped"), so mapping '' -> 'Ungrouped' before folding
// can collide two distinct runs onto the same key: a '' run and a literal
// "Ungrouped" run become indistinguishable, either merging adjacent runs
// (counts conflated) or producing two runs sharing one React key
// (React drops one). Keep '' and 'Ungrouped' distinct here; only the
// renderer maps '' to the "Ungrouped" display label.
export function groupServers(servers: Server[]): { group: string; servers: Server[] }[] {
  const out: { group: string; servers: Server[] }[] = []
  for (const s of servers) {
    const group = s.group
    const last = out[out.length - 1]
    if (last && last.group === group) last.servers.push(s)
    else out.push({ group, servers: [s] })
  }
  return out
}
