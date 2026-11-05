import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { parseTags } from './sidebarFilter'

// What the server list shows: a scope picked in the sidebar, then a sort
// applied inside each group. Group order always stays the backend's.

export type Scope = { kind: 'all' } | { kind: 'group'; group: string } | { kind: 'tag'; tag: string }
export type SortMode = 'manual' | 'recent' | 'name'

export const SORT_LABEL: Record<SortMode, string> = {
  manual: 'Manual order',
  recent: 'Recent first',
  name: 'By name',
}

export function inScope(s: Server, scope: Scope): boolean {
  if (scope.kind === 'group') return s.group === scope.group
  if (scope.kind === 'tag') return parseTags(s.tags).includes(scope.tag)
  return true
}

export function scopeTitle(scope: Scope): string {
  if (scope.kind === 'group') return scope.group || 'Ungrouped'
  if (scope.kind === 'tag') return `#${scope.tag}`
  return 'All servers'
}

export function sameScope(a: Scope, b: Scope): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'group' && b.kind === 'group') return a.group === b.group
  if (a.kind === 'tag' && b.kind === 'tag') return a.tag === b.tag
  return true
}

function usedAt(s: Server): number {
  const t = s.lastUsedAt ? new Date(s.lastUsedAt).getTime() : NaN
  return Number.isNaN(t) ? -Infinity : t
}

const byName = (a: Server, b: Server) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export interface GroupRun {
  group: string
  servers: Server[]
}

// groupRuns folds servers into groups in first-seen order and sorts inside
// each one. 'manual' keeps the stored order, the one drag-reorder writes.
export function groupRuns(servers: Server[], sort: SortMode): GroupRun[] {
  const runs = new Map<string, Server[]>()
  for (const s of servers) {
    const run = runs.get(s.group)
    if (run) run.push(s)
    else runs.set(s.group, [s])
  }
  const cmp = sort === 'recent' ? (a: Server, b: Server) => usedAt(b) - usedAt(a) || byName(a, b) : sort === 'name' ? byName : null
  return Array.from(runs, ([group, list]) => ({ group, servers: cmp ? [...list].sort(cmp) : list }))
}

export interface GroupSummary {
  group: string
  count: number
  // The environment every server in the group shares; null when mixed or none.
  env: Environment | null
}

// sharedEnv is the environment every server shares; null when mixed or none.
export function sharedEnv(list: Server[]): Environment | null {
  const env = list[0]?.environment
  return env && env !== Environment.EnvNone && list.every((s) => s.environment === env) ? env : null
}

export function groupSummaries(servers: Server[]): GroupSummary[] {
  return groupRuns(servers, 'manual').map(({ group, servers: list }) => ({ group, count: list.length, env: sharedEnv(list) }))
}

export interface TunnelSummary {
  up: number
  total: number
  failed: boolean
}

export function tunnelSummary(forwardIds: string[], stateOf: (id: string) => string | undefined): TunnelSummary {
  let up = 0
  let failed = false
  for (const id of forwardIds) {
    const st = stateOf(id)
    if (st === 'running') up++
    else if (st === 'error') failed = true
  }
  return { up, total: forwardIds.length, failed }
}
