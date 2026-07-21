import { create } from 'zustand'

// Sidebar-only UI state (spec 2026-07-21). Collapsed groups survive restarts
// via localStorage; the filter text and tag selection are deliberately
// session-only — a filter that silently persisted across launches would read
// as missing servers. Keys are the RAW group value ('' for the ungrouped
// run), never the "Ungrouped" display label.
const LS_KEY = 'sidebar.collapsedGroups'

// try/catch on every storage touch: vitest runs in node (no localStorage at
// all), and a corrupted value must degrade to "everything expanded", never
// throw at import time.
function readCollapsed(): Record<string, true> {
  try {
    const raw = localStorage.getItem(LS_KEY)
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

interface SidebarState {
  query: string
  tags: string[]
  collapsed: Record<string, true>
  setQuery: (q: string) => void
  toggleTag: (tag: string) => void
  clearFilter: () => void
  toggleGroup: (group: string) => void
}

export const useSidebar = create<SidebarState>((set, get) => ({
  query: '',
  tags: [],
  collapsed: readCollapsed(),

  setQuery: (query) => set({ query }),

  toggleTag: (tag) =>
    set((s) => ({
      tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag],
    })),

  clearFilter: () => set({ query: '', tags: [] }),

  toggleGroup: (group) => {
    const next = { ...get().collapsed }
    if (next[group]) delete next[group]
    else next[group] = true
    set({ collapsed: next })
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable — collapse still works for this session
    }
  },
}))
