import { create } from 'zustand'
import { SnippetService, SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Server, Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { SnippetInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { collectLeaves } from '../lib/paneTree'
import { matchesDangerous, splitPatterns } from '../lib/guard'
import { strToB64 } from '../lib/termbytes'
import { useSessions, type Tab } from './sessions'
import { useServers } from './servers'
import { useSettings } from './settings'
import { useGuard } from './guard'

// A stable empty fallback, mirroring TunnelsPanel's NO_FORWARDS — keeps the
// closed/unloaded state's array reference stable across renders (Zustand v5's
// unmemoized useSyncExternalStore needs snapshot identity to stay put).
const NO_SNIPPETS: Snippet[] = []

interface SnippetsState {
  // Applicable snippets per server (global + matching group + matching
  // server — SnippetService.ApplicableTo), keyed by serverId. Populated by
  // SnippetPalette when it opens.
  applicable: Record<string, Snippet[]>
  // The full unfiltered catalog, for the Settings manager.
  all: Snippet[]
  open: boolean

  load: (serverId: string, groupName: string) => Promise<void>
  loadAll: () => Promise<void>
  create: (input: SnippetInput) => Promise<string | null>
  update: (input: SnippetInput) => Promise<string | null>
  remove: (id: string) => Promise<string | null>
  // run sends snippet.body + "\r" to the focused pane's session, applying the
  // prod guard when the focused server is prod, guarding is enabled, and the
  // body matches a dangerous pattern. No-ops if no pane/session is focused.
  run: (snippet: Snippet) => void
  // runSlot resolves the focused pane's server, looks up the snippet bound to
  // slot for that server/group via SnippetService.BySlot, and runs it
  // (guarded). No-ops if no pane is focused or nothing is bound to the slot.
  runSlot: (slot: number) => Promise<void>
  show: () => void
  hide: () => void
  toggle: () => void
}

// resolveFocusedServer walks tabs/activeTabId to the active tab's focused
// leaf and resolves its server. Shared by focusedServer (imperative
// getState() snapshot) and useFocusedServer (reactive selectors) below.
// collectLeaves's return type is the broader PaneNode union even though
// every element it returns is actually a leaf (a split node can't be a leaf
// of itself), so the `kind === 'leaf'` check here is a real narrow, not dead
// code — mirrors BroadcastBar's `if (leaf.kind !== 'leaf') continue`.
function resolveFocusedServer(tabs: Tab[], activeTabId: string | null, servers: Server[]): Server | null {
  const active = tabs.find((t) => t.id === activeTabId)
  if (!active) return null
  const leaf = collectLeaves(active.root).find((l) => l.id === active.focusedPaneId)
  if (!leaf || leaf.kind !== 'leaf') return null
  return servers.find((s) => s.id === leaf.serverId) ?? null
}

// focusedServer resolves the active tab's focused leaf to its server, with NO
// session requirement. Only used internally by focusedTarget below — the
// reactive useFocusedServer hook is what SnippetPalette's render uses.
function focusedServer(): Server | null {
  const st = useSessions.getState()
  return resolveFocusedServer(st.tabs, st.activeTabId, useServers.getState().servers)
}

// useFocusedServer is the reactive counterpart of focusedServer, for
// SnippetPalette's render: it subscribes via selectors (not a getState()
// snapshot) so the palette re-renders if the focused pane/tab changes while
// it's open.
export function useFocusedServer(): Server | null {
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const servers = useServers((s) => s.servers)
  return resolveFocusedServer(tabs, activeTabId, servers)
}

// focusedTarget resolves the active tab's focused leaf to its session id and
// server — shared by run/runSlot below, which must no-op when the pane has
// no live session yet. Not exported: only the store's own actions call it.
function focusedTarget(): { sessionId: string; server: Server } | null {
  const st = useSessions.getState()
  const active = st.tabs.find((t) => t.id === st.activeTabId)
  if (!active) return null
  const sessionId = st.paneSession[active.focusedPaneId]
  if (!sessionId) return null
  const server = focusedServer()
  if (!server) return null
  return { sessionId, server }
}

export const useSnippets = create<SnippetsState>((set, get) => ({
  applicable: {},
  all: [],
  open: false,

  load: async (serverId, groupName) => {
    try {
      const list = (await SnippetService.ApplicableTo(serverId, groupName)) ?? []
      set((s) => ({ applicable: { ...s.applicable, [serverId]: list } }))
    } catch {
      set((s) => ({ applicable: { ...s.applicable, [serverId]: [] } }))
    }
  },

  loadAll: async () => {
    try {
      set({ all: (await SnippetService.List()) ?? [] })
    } catch {
      set({ all: [] })
    }
  },

  create: async (input) => {
    try {
      await SnippetService.Create(input)
      await get().loadAll()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  update: async (input) => {
    try {
      await SnippetService.Update(input)
      await get().loadAll()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  remove: async (id) => {
    try {
      await SnippetService.Delete(id)
      await get().loadAll()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  },

  run: (snippet) => {
    const target = focusedTarget()
    if (!target) return
    const { sessionId, server } = target

    const send = () => {
      void SSHService.Write(sessionId, strToB64(snippet.body + '\r'))
    }

    const settings = useSettings.getState().settings
    const patterns = settings ? splitPatterns(settings.guardPatterns) : []
    const isProd = server.environment === Environment.EnvProd
    if (isProd && settings?.guardEnabled && matchesDangerous(snippet.body, patterns)) {
      useGuard.getState().requestGuard({
        command: snippet.body,
        targets: [{ host: server.name || server.host, env: server.environment }],
        onConfirm: send,
      })
      return
    }
    send()
  },

  runSlot: async (slot) => {
    const target = focusedTarget()
    if (!target) return
    try {
      const snippet = await SnippetService.BySlot(slot, target.server.id, target.server.group)
      if (snippet) get().run(snippet)
    } catch {
      // No snippet bound to this slot for this server/group — no-op.
    }
  },

  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}))

// Selector helper mirroring TunnelsPanel's NO_FORWARDS pattern — callers use
// `useSnippets((s) => s.applicable[serverId] ?? NO_SNIPPETS)` directly; this
// export just gives them the same stable reference.
export { NO_SNIPPETS }
