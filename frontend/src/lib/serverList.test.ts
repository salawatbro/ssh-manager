import { describe, expect, it } from 'vitest'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { groupRuns, groupSummaries, inScope, sameScope, scopeTitle, tunnelSummary } from './serverList'

function srv(id: string, group: string, over: Partial<Server> = {}): Server {
  return { id, name: id, group, tags: '', environment: Environment.EnvNone, lastUsedAt: null, ...over } as Server
}

const list = [
  srv('web', 'Prod', { environment: Environment.EnvProd, lastUsedAt: '2026-11-01T10:00:00Z', tags: 'web,k8s' }),
  srv('api', 'Prod', { environment: Environment.EnvProd, lastUsedAt: '2026-11-04T10:00:00Z' }),
  srv('Cache', 'Prod', { environment: Environment.EnvProd }),
  srv('nas', 'Home', { environment: Environment.EnvDev, tags: 'k8s' }),
  srv('pi', 'Home', { environment: Environment.EnvNone }),
]

describe('scope', () => {
  it('filters by group and tag', () => {
    expect(list.filter((s) => inScope(s, { kind: 'group', group: 'Home' })).map((s) => s.id)).toEqual(['nas', 'pi'])
    expect(list.filter((s) => inScope(s, { kind: 'tag', tag: 'k8s' })).map((s) => s.id)).toEqual(['web', 'nas'])
    expect(list.filter((s) => inScope(s, { kind: 'all' }))).toHaveLength(5)
  })

  it('titles and compares scopes', () => {
    expect(scopeTitle({ kind: 'all' })).toBe('All servers')
    expect(scopeTitle({ kind: 'group', group: '' })).toBe('Ungrouped')
    expect(scopeTitle({ kind: 'tag', tag: 'pg' })).toBe('#pg')
    expect(sameScope({ kind: 'group', group: 'a' }, { kind: 'group', group: 'a' })).toBe(true)
    expect(sameScope({ kind: 'group', group: 'a' }, { kind: 'tag', tag: 'a' })).toBe(false)
  })
})

describe('groupRuns', () => {
  it('keeps group order and the stored order for manual', () => {
    const runs = groupRuns(list, 'manual')
    expect(runs.map((r) => r.group)).toEqual(['Prod', 'Home'])
    expect(runs[0].servers.map((s) => s.id)).toEqual(['web', 'api', 'Cache'])
  })

  it('sorts recent first, never-used last, inside each group', () => {
    expect(groupRuns(list, 'recent')[0].servers.map((s) => s.id)).toEqual(['api', 'web', 'Cache'])
  })

  it('sorts by name ignoring case', () => {
    expect(groupRuns(list, 'name')[0].servers.map((s) => s.id)).toEqual(['api', 'Cache', 'web'])
  })
})

describe('groupSummaries', () => {
  it('reports a shared environment, or none when mixed', () => {
    expect(groupSummaries(list)).toEqual([
      { group: 'Prod', count: 3, env: Environment.EnvProd },
      { group: 'Home', count: 2, env: null },
    ])
  })
})

describe('tunnelSummary', () => {
  it('counts running tunnels and flags a failure', () => {
    const states: Record<string, string> = { a: 'running', b: 'error' }
    expect(tunnelSummary(['a', 'b', 'c'], (id) => states[id])).toEqual({ up: 1, total: 3, failed: true })
    expect(tunnelSummary([], () => undefined)).toEqual({ up: 0, total: 0, failed: false })
  })
})
