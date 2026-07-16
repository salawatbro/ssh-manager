import { create } from 'zustand'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { replaceLeaf, removeLeaf, firstLeaf } from '../lib/paneTree'

// A tab's panes form a binary split tree; a leaf is one terminal session for a
// server. Task 6 fills in splitFocused/closePane; v0.3-Task-5 only ever builds
// single-leaf trees.
export type PaneNode =
  | { kind: 'leaf'; id: string; serverId: string }
  | { kind: 'split'; id: string; dir: 'h' | 'v'; a: PaneNode; b: PaneNode; ratio: number }

export interface Tab {
  id: string
  serverId: string
  title: string
  hostLabel: string
  root: PaneNode
  focusedPaneId: string
}

interface SessionsState {
  tabs: Tab[]
  activeTabId: string | null
  open: (server: Server) => void
  closeTab: (tabId: string) => void
  selectTab: (tabId: string) => void
  nextTab: () => void
  prevTab: () => void
  focusPane: (tabId: string, paneId: string) => void
  // Task 6:
  splitFocused: (dir: 'h' | 'v') => void
  closePane: (tabId: string, paneId: string) => void
}

function cycle(tabs: Tab[], activeId: string | null, delta: number): string | null {
  if (tabs.length === 0) return null
  const i = tabs.findIndex((t) => t.id === activeId)
  const next = (((i < 0 ? 0 : i) + delta) % tabs.length + tabs.length) % tabs.length
  return tabs[next].id
}

export const useSessions = create<SessionsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  // A new tab, one leaf, one session. Multiple tabs to the same server are
  // allowed (each leaf id is unique, so each drives its own PTY).
  open: (server) => {
    const paneId = crypto.randomUUID()
    const tab: Tab = {
      id: crypto.randomUUID(),
      serverId: server.id,
      title: server.name || server.host,
      hostLabel: `${server.user}@${server.host}`,
      root: { kind: 'leaf', id: paneId, serverId: server.id },
      focusedPaneId: paneId,
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
  },

  // Removing the tab unmounts its terminals, whose cleanup calls
  // SSHService.Close — so no explicit backend teardown is needed here.
  closeTab: (tabId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      const activeTabId =
        s.activeTabId === tabId ? (tabs.length ? tabs[Math.max(0, s.tabs.findIndex((t) => t.id === tabId) - 1)]?.id ?? tabs[0].id : null) : s.activeTabId
      return { tabs, activeTabId }
    }),

  selectTab: (tabId) => set({ activeTabId: tabId }),
  nextTab: () => set((s) => ({ activeTabId: cycle(s.tabs, s.activeTabId, 1) })),
  prevTab: () => set((s) => ({ activeTabId: cycle(s.tabs, s.activeTabId, -1) })),

  focusPane: (tabId, paneId) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, focusedPaneId: paneId } : t)) })),

  // splitFocused splits the active tab's focused leaf into a two-pane split,
  // opening a new session to the SAME server. dir 'v' = side-by-side, 'h' =
  // stacked (dizayn manbasi: ⌘D / ⌘⇧D). The new pane takes focus.
  splitFocused: (dir) =>
    set((s) => {
      const active = s.tabs.find((t) => t.id === s.activeTabId)
      if (!active) return {}
      const newId = crypto.randomUUID()
      const root = replaceLeaf(active.root, active.focusedPaneId, (leaf) => ({
        kind: 'split',
        id: crypto.randomUUID(),
        dir,
        a: leaf,
        b: { kind: 'leaf', id: newId, serverId: leaf.kind === 'leaf' ? leaf.serverId : active.serverId },
        ratio: 0.5,
      }))
      return { tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, root, focusedPaneId: newId } : t)) }
    }),

  // closePane removes a leaf; when it was the tab's last pane the tab closes.
  // The removed pane's Terminal unmounts → SSHService.Close runs, so no
  // explicit backend teardown here.
  closePane: (tabId, paneId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab) return {}
      const root = removeLeaf(tab.root, paneId)
      if (root === null) {
        const tabs = s.tabs.filter((t) => t.id !== tabId)
        const activeTabId =
          s.activeTabId === tabId ? (tabs.length ? tabs[Math.max(0, s.tabs.findIndex((t) => t.id === tabId) - 1)]?.id ?? tabs[0].id : null) : s.activeTabId
        return { tabs, activeTabId }
      }
      const focusedPaneId = tab.focusedPaneId === paneId ? firstLeaf(root).id : tab.focusedPaneId
      return { tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, root, focusedPaneId } : t)) }
    }),
}))
