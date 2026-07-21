import Fuse, { type IFuseOptions } from 'fuse.js'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// One fuse config for every server search surface: the ⌘K palette here and
// the sidebar filter (lib/sidebarFilter.ts) must match exactly — a shared
// constant is what keeps them from drifting apart.
export const SERVER_FUSE_OPTIONS: IFuseOptions<Server> = {
  keys: ['name', 'host', 'user', 'group', 'tags'],
  threshold: 0.4,
  ignoreLocation: true,
}

// searchServers returns the palette's server rows. Empty query → recency order
// (LastUsedAt desc, then UseCount desc — FR-08). A query → fuse.js fuzzy over
// the fields a user would type. N is small (a person's server list), so building
// a Fuse per keystroke is well under the 100ms budget.
export function searchServers(servers: Server[], query: string): Server[] {
  const q = query.trim()
  if (!q) return [...servers].sort(byRecency)
  const fuse = new Fuse(servers, SERVER_FUSE_OPTIONS)
  return fuse.search(q).map((r) => r.item)
}

function byRecency(a: Server, b: Server): number {
  const at = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0
  const bt = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0
  if (bt !== at) return bt - at
  return b.useCount - a.useCount
}
