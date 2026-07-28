import { describe, expect, it } from 'vitest'
import { moveWithinGroup, reorderWithinGroup } from './serverOrder'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

function group(...ids: string[]): Server[] {
  return ids.map((id) => ({ id, group: 'Prod' }) as Server)
}

// A server in another group must never appear in the returned list: the list
// is committed wholesale to SetGroupOrder, so a stray id would reorder rows
// the user never touched.
const other = { id: 'x', group: 'Dev' } as Server

describe('moveWithinGroup', () => {
  it('moves a server one slot up', () => {
    expect(moveWithinGroup([...group('a', 'b', 'c'), other], 'Prod', 'b', 'up')).toEqual(['b', 'a', 'c'])
  })

  it('moves a server one slot down', () => {
    expect(moveWithinGroup([...group('a', 'b', 'c'), other], 'Prod', 'b', 'down')).toEqual(['a', 'c', 'b'])
  })

  it('refuses to move the first server up', () => {
    expect(moveWithinGroup(group('a', 'b'), 'Prod', 'a', 'up')).toBeNull()
  })

  it('refuses to move the last server down', () => {
    expect(moveWithinGroup(group('a', 'b'), 'Prod', 'b', 'down')).toBeNull()
  })

  it('refuses an id that is not in the group', () => {
    expect(moveWithinGroup(group('a', 'b'), 'Prod', 'zzz', 'up')).toBeNull()
  })

  it('returns the full group, not just the moved rows', () => {
    expect(moveWithinGroup(group('a', 'b', 'c', 'd'), 'Prod', 'd', 'up')).toEqual(['a', 'b', 'd', 'c'])
  })
})

describe('reorderWithinGroup', () => {
  it('drops a server before its target', () => {
    expect(reorderWithinGroup(group('a', 'b', 'c'), 'Prod', 'c', 'a', false)).toEqual(['c', 'a', 'b'])
  })

  it('drops a server after its target', () => {
    expect(reorderWithinGroup(group('a', 'b', 'c'), 'Prod', 'a', 'c', true)).toEqual(['b', 'c', 'a'])
  })

  it('refuses a drop onto itself', () => {
    expect(reorderWithinGroup(group('a', 'b'), 'Prod', 'a', 'a', false)).toBeNull()
  })

  it('refuses an unknown target', () => {
    expect(reorderWithinGroup(group('a', 'b'), 'Prod', 'a', 'zzz', false)).toBeNull()
  })
})
