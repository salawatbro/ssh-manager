import { describe, expect, it } from 'vitest'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { parseTags, allTags, filterServers } from './sidebarFilter'

// Minimal fixture — only the fields the filter reads matter; the cast keeps
// the fixture honest against renames of those fields without dragging in the
// full generated shape.
function srv(id: string, over: Partial<Record<string, unknown>> = {}): Server {
  return {
    id,
    name: id,
    host: 'h.local',
    port: 22,
    user: 'deploy',
    group: '',
    tags: '',
    ...over,
  } as unknown as Server
}

describe('parseTags', () => {
  it('splits the CSV column', () => {
    expect(parseTags('db,prod')).toEqual(['db', 'prod'])
  })

  it('returns [] for an empty column', () => {
    expect(parseTags('')).toEqual([])
  })

  it('drops empty items from a trailing comma', () => {
    expect(parseTags('db,')).toEqual(['db'])
  })
})

describe('allTags', () => {
  it('returns distinct tags in first-seen order', () => {
    const list = [srv('a', { tags: 'web,db' }), srv('b', { tags: 'db,cache' }), srv('c')]
    expect(allTags(list)).toEqual(['web', 'db', 'cache'])
  })
})

describe('filterServers', () => {
  it('returns the same content when nothing is active', () => {
    const list = [srv('a'), srv('b')]
    expect(filterServers(list, '', [])).toEqual(list)
  })

  it('keeps the ORIGINAL order, not fuse score order', () => {
    // fuse would rank the exact-match name 'prod' above 'zz-prod-db'; the
    // sidebar must keep the backend order (zz-prod-db first).
    const list = [srv('zz-prod-db', { name: 'zz-prod-db' }), srv('prod', { name: 'prod' })]
    expect(filterServers(list, 'prod', []).map((s) => s.id)).toEqual(['zz-prod-db', 'prod'])
  })

  it('ORs the selected tags', () => {
    const list = [srv('a', { tags: 'web' }), srv('b', { tags: 'db' }), srv('c', { tags: '' })]
    expect(filterServers(list, '', ['web', 'db']).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('ANDs the text query with the tag selection', () => {
    const list = [srv('api-1', { name: 'api-1', tags: 'prod' }), srv('api-2', { name: 'api-2', tags: 'dev' })]
    expect(filterServers(list, 'api', ['prod']).map((s) => s.id)).toEqual(['api-1'])
  })

  it('matches over host and user too', () => {
    const list = [srv('a', { host: '10.0.9.7' }), srv('b', { user: 'postgres' })]
    expect(filterServers(list, '10.0.9', []).map((s) => s.id)).toEqual(['a'])
    expect(filterServers(list, 'postgres', []).map((s) => s.id)).toEqual(['b'])
  })
})
