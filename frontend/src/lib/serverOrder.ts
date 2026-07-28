import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// The within-group ordering rule, in one place. Both entry points -- drag and
// the context menu's Move up/down -- go through here, so they cannot compute
// different orders for ServerService.SetGroupOrder, which is itself the sole
// writer of sort_order.
//
// Both functions return the group's FULL id list (that is what SetGroupOrder
// takes) or null when the move is impossible. Callers pass the UNFILTERED
// server list: a filtered list would omit ids and commit a partial order.

function groupIds(servers: Server[], group: string): string[] {
  return servers.filter((s) => s.group === group).map((s) => s.id)
}

// moveWithinGroup shifts `id` one slot in `dir`. Null when the id is not in
// the group or is already at that edge.
export function moveWithinGroup(
  servers: Server[],
  group: string,
  id: string,
  dir: 'up' | 'down',
): string[] | null {
  const ids = groupIds(servers, group)
  const from = ids.indexOf(id)
  if (from < 0) return null
  const to = dir === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= ids.length) return null
  ids.splice(from, 1)
  ids.splice(to, 0, id)
  return ids
}

// reorderWithinGroup moves `id` to sit before or after `targetId` -- the
// drag-and-drop rule. Null when either id is missing or they are the same row.
export function reorderWithinGroup(
  servers: Server[],
  group: string,
  id: string,
  targetId: string,
  after: boolean,
): string[] | null {
  if (id === targetId) return null
  const ids = groupIds(servers, group)
  const from = ids.indexOf(id)
  if (from < 0) return null
  ids.splice(from, 1)
  const to = ids.indexOf(targetId)
  if (to < 0) return null
  ids.splice(to + (after ? 1 : 0), 0, id)
  return ids
}
