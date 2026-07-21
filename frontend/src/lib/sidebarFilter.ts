import Fuse from 'fuse.js'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// Sidebar filter helpers (spec 2026-07-21). Pure and framework-free so the
// OR/AND semantics and the order guarantee are unit-testable.

// parseTags splits the CSV `Server.tags` column. ServerForm joins tags with
// ',' and never escapes (a tag cannot contain a comma), so a plain split is
// the whole grammar; filter(Boolean) shrugs off a trailing comma.
export function parseTags(csv: string): string[] {
  return csv ? csv.split(',').filter(Boolean) : []
}

// allTags returns the distinct tags across all servers in first-seen order —
// stable against list re-sorting, so the chip row never jumps around.
export function allTags(servers: Server[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of servers) {
    for (const t of parseTags(s.tags)) {
      if (!seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
  }
  return out
}

// filterServers narrows the sidebar list: selected tags are OR'd (a server
// passes with ANY of them), the text query fuzzes over the same fields the
// ⌘K palette searches, and the two combine as AND. The BACKEND order is
// preserved throughout — fuse returns score order, but groupServers folds
// adjacent runs, so only the match SET is taken from it and the original
// array is filtered.
export function filterServers(servers: Server[], query: string, tags: string[]): Server[] {
  let out = servers
  if (tags.length > 0) {
    out = out.filter((s) => {
      const own = parseTags(s.tags)
      return tags.some((t) => own.includes(t))
    })
  }
  const q = query.trim()
  if (q) {
    const fuse = new Fuse(out, {
      keys: ['name', 'host', 'user', 'group', 'tags'],
      threshold: 0.4,
      ignoreLocation: true,
    })
    const hit = new Set(fuse.search(q).map((r) => r.item.id))
    out = out.filter((s) => hit.has(s.id))
  }
  return out
}
