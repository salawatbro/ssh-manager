import { create } from 'zustand'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useSftp } from './sftp'
import { replaceLeaf, removeLeaf, firstLeaf } from '../lib/paneTree'
import type { TermStatus } from '../hooks/useTerminalSession'

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
  // Wall-clock open time (Date.now()) — the status bar's uptime segment
  // (MainWindow.dc.html, `00:14:32`) ticks off this, not a running timer.
  startedAt: number
}

// A pane's live xterm grid size, keyed by leaf (pane) id — mirrors paneStatus
// below; lets the status bar show the ACTIVE pane's dims without its own xterm.
export interface PaneDims {
  cols: number
  rows: number
}

// A pane's detected shell and whether a shell-integration snippet was actually
// injected for it, keyed by leaf (pane) id — mirrors paneStatus/paneDims. The
// status bar reads this to report integration honestly instead of implying it
// is always on.
export interface PaneShell {
  shell: string
  integration: boolean
}

interface SessionsState {
  tabs: Tab[]
  activeTabId: string | null
  // Per-pane connection status, keyed by leaf (pane) id — mirrored from
  // useTerminalSession so the tab strip (no PTY of its own) can read it.
  paneStatus: Record<string, TermStatus>
  setPaneStatus: (paneId: string, status: TermStatus) => void
  clearPaneStatus: (paneId: string) => void
  paneDims: Record<string, PaneDims>
  setPaneDims: (paneId: string, dims: PaneDims) => void
  clearPaneDims: (paneId: string) => void
  // paneId → live session id (useTerminalSession); BroadcastBar's source for sessionIds.
  paneSession: Record<string, string>
  setPaneSession: (paneId: string, sessionId: string) => void
  clearPaneSession: (paneId: string) => void
  paneShell: Record<string, PaneShell>
  setPaneShell: (paneId: string, info: PaneShell) => void
  clearPaneShell: (paneId: string) => void
  // Both cleared together, once, from useTerminalSession's cleanup — a single
  // action rather than two separate calls so "the pane's session and shell
  // info both drop on teardown" is one behavior a store test can hold to,
  // not two independent call sites that could silently drift apart.
  clearPaneConnection: (paneId: string) => void
  open: (server: Server) => void
  openOrFocus: (server: Server) => void
  closeTab: (tabId: string) => void
  selectTab: (tabId: string) => void
  nextTab: () => void
  prevTab: () => void
  focusPane: (tabId: string, paneId: string) => void
  // Task 6:
  splitFocused: (dir: 'h' | 'v') => void
  closePane: (tabId: string, paneId: string) => void
}

// SFTP and the terminal area share the content slot, so every action here that
// brings a terminal tab forward has to hand focus over (the SFTP session stays
// open — only the frontmost-view flag moves). One choke point, rather than
// chasing the many call sites: tab strip, ⌘K, double-click, tray, ⌘1–9, ⌘⇧]/[.
function focusTerminals() {
  if (useSftp.getState().active) useSftp.getState().blur()
}

// The mirror of focusTerminals, for the closing side: with the last tab gone the
// terminal area has nothing to show, so an open SFTP session becomes the
// frontmost view (lib/mainView.ts falls back to it) and its focus flag has to
// say so — else its tab reads inactive and its Escape-to-close stays dead.
function focusSftpIfNoTabsLeft(remaining: Tab[]) {
  if (remaining.length === 0) useSftp.getState().focus()
}

function cycle(tabs: Tab[], activeId: string | null, delta: number): string | null {
  if (tabs.length === 0) return null
  const i = tabs.findIndex((t) => t.id === activeId)
  const next = (((i < 0 ? 0 : i) + delta) % tabs.length + tabs.length) % tabs.length
  return tabs[next].id
}

// Shared by closeTab/closePane: tabs+activeTabId after removing one tab. If
// the closed tab wasn't active, activeId is unchanged; otherwise step back
// one from its pre-removal position (or the first remaining tab), or null.
function closeTabState(tabs: Tab[], closedId: string, activeId: string | null): { tabs: Tab[]; activeTabId: string | null } {
  const remaining = tabs.filter((t) => t.id !== closedId)
  if (activeId !== closedId) return { tabs: remaining, activeTabId: activeId }
  const idx = tabs.findIndex((t) => t.id === closedId)
  return { tabs: remaining, activeTabId: remaining.length ? remaining[Math.max(0, idx - 1)]?.id ?? remaining[0].id : null }
}

// Shared by the per-pane maps' clear* actions (paneStatus/paneDims/paneSession):
// drop one key, or return the same record reference untouched if it's absent.
function clearKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export const useSessions = create<SessionsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  paneStatus: {},
  setPaneStatus: (paneId, status) => set((s) => ({ paneStatus: { ...s.paneStatus, [paneId]: status } })),
  clearPaneStatus: (paneId) => set((s) => ({ paneStatus: clearKey(s.paneStatus, paneId) })),

  paneDims: {},
  setPaneDims: (paneId, dims) => set((s) => ({ paneDims: { ...s.paneDims, [paneId]: dims } })),
  clearPaneDims: (paneId) => set((s) => ({ paneDims: clearKey(s.paneDims, paneId) })),

  paneSession: {},
  setPaneSession: (paneId, sessionId) => set((s) => ({ paneSession: { ...s.paneSession, [paneId]: sessionId } })),
  clearPaneSession: (paneId) => set((s) => ({ paneSession: clearKey(s.paneSession, paneId) })),

  paneShell: {},
  setPaneShell: (paneId, info) => set((s) => ({ paneShell: { ...s.paneShell, [paneId]: info } })),
  clearPaneShell: (paneId) => set((s) => ({ paneShell: clearKey(s.paneShell, paneId) })),
  clearPaneConnection: (paneId) =>
    set((s) => ({
      paneSession: clearKey(s.paneSession, paneId),
      paneShell: clearKey(s.paneShell, paneId),
    })),

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
      startedAt: Date.now(),
    }
    focusTerminals()
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
  },

  // Tray quick-connect: focus an existing tab for this server if one is open,
  // otherwise start a fresh session. Stops a menu-bar click from stacking
  // duplicate tabs on the same server. Takes the full Server (App.tsx resolves
  // it from the servers store) so this store needs no cross-store import.
  openOrFocus: (server) => {
    const existing = get().tabs.find((t) => t.serverId === server.id)
    if (existing) {
      focusTerminals()
      set({ activeTabId: existing.id })
      return
    }
    get().open(server)
  },

  // Removing the tab unmounts its terminals, whose cleanup calls
  // SSHService.Close — so no explicit backend teardown is needed here.
  closeTab: (tabId) => {
    set((s) => closeTabState(s.tabs, tabId, s.activeTabId))
    focusSftpIfNoTabsLeft(get().tabs)
  },

  selectTab: (tabId) => {
    focusTerminals()
    set({ activeTabId: tabId })
  },
  nextTab: () => {
    focusTerminals()
    set((s) => ({ activeTabId: cycle(s.tabs, s.activeTabId, 1) }))
  },
  prevTab: () => {
    focusTerminals()
    set((s) => ({ activeTabId: cycle(s.tabs, s.activeTabId, -1) }))
  },

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
  closePane: (tabId, paneId) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab) return {}
      const root = removeLeaf(tab.root, paneId)
      if (root === null) return closeTabState(s.tabs, tabId, s.activeTabId)
      const focusedPaneId = tab.focusedPaneId === paneId ? firstLeaf(root).id : tab.focusedPaneId
      return { tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, root, focusedPaneId } : t)) }
    })
    // Only fires on the branch that removed the tab's last pane (and with it
    // the last tab) — otherwise tabs is non-empty and this is a no-op.
    focusSftpIfNoTabsLeft(get().tabs)
  },
}))
