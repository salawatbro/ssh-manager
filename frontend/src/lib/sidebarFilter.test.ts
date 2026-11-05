import { describe, expect, it } from 'vitest'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { parseTags, allTags } from './sidebarFilter'

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
