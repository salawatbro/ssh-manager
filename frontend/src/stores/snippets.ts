import { create } from 'zustand'
import { SnippetService, SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { SnippetScope, type Server, type Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { SnippetInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { collectLeaves } from '../lib/paneTree'
import { guardDecisionFor, LOCAL_SCOPE_TARGET } from '../lib/guard'
import { isLocalTarget } from '../lib/paneTarget'
import { strToB64 } from '../lib/termbytes'
import { useSessions, type Tab } from './sessions'
import { usePanes } from './panes'
import { useServers } from './servers'
import { useSettings } from './settings'
import { useGuard } from './guard'

// A stable empty fallback, mirroring TunnelsPanel's NO_FORWARDS — keeps the
// closed/unloaded state's array reference stable across renders (Zustand v5's
// unmemoized useSyncExternalStore needs snapshot identity to stay put).
const NO_SNIPPETS: Snippet[] = []

// A local pane has no server and no group, so only GLOBAL snippets apply.
// SnippetService.ApplicableTo('', '') would also return anything scoped to the
// empty group (the "Ungrouped" bucket), which is unrelated — hence the filter
// rather than trusting the query's shape.
export function globalOnly(snippets: Snippet[]): Snippet[] {
  return snippets.filter((s) => s.scope === SnippetScope.ScopeGlobal)
}

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
  // guard when guarding is enabled and the body matches a dangerous pattern
  // — the prod pattern list for a server pane tagged prod, the local pattern
  // list for a local pane. No-ops if no pane/session is focused.
  run: (snippet: Snippet) => void
  // runSlot resolves the focused pane (server or local), looks up the
  // snippet bound to slot via SnippetService.BySlot — empty server/group
  // args for a local pane — and runs it (guarded). No-ops if no pane is
  // focused or nothing is bound to the slot.
  runSlot: (slot: number) => Promise<void>
  show: () => void
  hide: () => void
  toggle: () => void
}

// resolveFocusedServer walks tabs/activeTabId to the active tab's focused
// leaf and resolves its server. Returns null both when no pane is focused
// AND when the focused pane is local (a local pane's sentinel serverId never
// matches a real server) — callers that need to tell those two apart use
// useFocusedPaneKey below instead. Shared by useFocusedServer (reactive
// selectors) below. collectLeaves's return type is the broader PaneNode
// union even though every element it returns is actually a leaf (a split
// node can't be a leaf of itself), so the `kind === 'leaf'` check here is a
// real narrow, not dead code — mirrors BroadcastBar's `if (leaf.kind !==
// 'leaf') continue`.
function resolveFocusedServer(tabs: Tab[], activeTabId: string | null, servers: Server[]): Server | null {
  const active = tabs.find((t) => t.id === activeTabId)
  if (!active) return null
  const leaf = collectLeaves(active.root).find((l) => l.id === active.focusedPaneId)
  if (!leaf || leaf.kind !== 'leaf') return null
  return servers.find((s) => s.id === leaf.serverId) ?? null
}

// useFocusedServer is the reactive counterpart of resolveFocusedServer, for
// SnippetPalette's render: it subscribes via selectors (not a getState()
// snapshot) so the palette re-renders if the focused pane/tab changes while
// it's open. null for both "no pane focused" and "the focused pane is
// local" — pair with useFocusedPaneKey to distinguish those.
export function useFocusedServer(): Server | null {
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const servers = useServers((s) => s.servers)
  return resolveFocusedServer(tabs, activeTabId, servers)
}

// useFocusedPaneKey is the reactive key for the focused pane's snippet
// scope: the real server id for a server pane, the local sentinel for a
// local pane (via leaf.serverId — never spelled out here, see
// lib/paneTarget.ts), or null when no pane is focused at all. SnippetPalette
// pairs this with isLocalTarget and useFocusedServer to tell "no pane
// focused" apart from "local pane focused", which useFocusedServer alone
// cannot: both currently resolve to a null server.
export function useFocusedPaneKey(): string | null {
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const active = tabs.find((t) => t.id === activeTabId)
  if (!active) return null
  const leaf = collectLeaves(active.root).find((l) => l.id === active.focusedPaneId)
  return leaf && leaf.kind === 'leaf' ? leaf.serverId : null
}

// focusedTarget resolves the active tab's focused leaf to its session id and
// server — shared by run/runSlot below, which must no-op when the pane has
// no live session yet. Not exported: only the store's own actions call it.
// A local pane has no server; the caller handles server === null (global
// snippets, local guard patterns).
function focusedTarget(): { sessionId: string; server: Server | null } | null {
  const st = useSessions.getState()
  const active = st.tabs.find((t) => t.id === st.activeTabId)
  if (!active) return null
  const sessionId = usePanes.getState().paneSession[active.focusedPaneId]
  if (!sessionId) return null
  const leaf = collectLeaves(active.root).find((l) => l.id === active.focusedPaneId)
  if (!leaf || leaf.kind !== 'leaf') return null
  const server = isLocalTarget(leaf.serverId)
    ? null
    : useServers.getState().servers.find((s) => s.id === leaf.serverId) ?? null
  if (!isLocalTarget(leaf.serverId) && !server) return null
  return { sessionId, server }
}

export const useSnippets = create<SnippetsState>((set, get) => ({
  applicable: {},
  all: [],
  open: false,

  load: async (serverId, groupName) => {
    try {
      const got = (await SnippetService.ApplicableTo(isLocalTarget(serverId) ? '' : serverId, groupName)) ?? []
      const list = isLocalTarget(serverId) ? globalOnly(got) : got
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
      void SSHService.Write(sessionId, strToB64(snippet.body + '\r')).catch(() => {})
    }

    const settings = useSettings.getState().settings
    const scopeTarget = server ? { host: server.name || server.host, env: server.environment, local: false } : LOCAL_SCOPE_TARGET
    const decision = guardDecisionFor(snippet.body, [scopeTarget], settings)
    if (decision) {
      useGuard.getState().requestGuard({
        command: snippet.body,
        title: decision.title,
        targets: decision.targets,
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
      const snippet = await SnippetService.BySlot(slot, target.server?.id ?? '', target.server?.group ?? '')
      if (!snippet) return
      // BySlot('', '') has the same Ungrouped-bucket leak as ApplicableTo('',
      // '') (see globalOnly above) — a group-scoped slot binding in the
      // empty group could otherwise fire on a local pane.
      if (!target.server && snippet.scope !== SnippetScope.ScopeGlobal) return
      get().run(snippet)
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
