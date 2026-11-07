import { create } from 'zustand'
import { sameScope, type Scope, type SortMode } from '../lib/serverList'

// Server-list UI state. Collapsed groups and the sort survive restarts via
// localStorage; the scope is session-only, so a restart never opens on a
// filtered list that reads as missing servers. Collapse keys are the RAW group
// value ('' for the ungrouped run), never the "Ungrouped" label.
const COLLAPSED_KEY = 'sidebar.collapsedGroups'
const SORT_KEY = 'serverList.sort'
const SORTS: SortMode[] = ['manual', 'recent', 'name']

// try/catch on every storage touch: vitest runs in node (no localStorage at
// all), and a corrupted value must degrade to the default, never throw.
function readCollapsed(): Record<string, true> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, true> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v === true) out[k] = true
      }
      return out
    }
  } catch {
    // unavailable or corrupted storage — start expanded
  }
  return {}
}

function readSort(): SortMode {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    return SORTS.find((s) => s === raw) ?? 'manual'
  } catch {
    return 'manual'
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable — the change still holds for this session
  }
}

interface SidebarState {
  scope: Scope
  sort: SortMode
  collapsed: Record<string, true>
  setScope: (scope: Scope) => void
  // Picking the scope that is already active goes back to all servers.
  toggleScope: (scope: Scope) => void
  setSort: (sort: SortMode) => void
  toggleGroup: (group: string) => void
}

export const useSidebar = create<SidebarState>((set, get) => ({
  scope: { kind: 'all' },
  sort: readSort(),
  collapsed: readCollapsed(),

  setScope: (scope) => set({ scope }),

  toggleScope: (scope) => set({ scope: sameScope(get().scope, scope) ? { kind: 'all' } : scope }),

  setSort: (sort) => {
    set({ sort })
    write(SORT_KEY, sort)
  },

  toggleGroup: (group) => {
    const next = { ...get().collapsed }
    if (next[group]) delete next[group]
    else next[group] = true
    set({ collapsed: next })
    write(COLLAPSED_KEY, JSON.stringify(next))
  },
}))
