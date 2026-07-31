import { describe, expect, it } from 'vitest'
import { failedIds, nextFailedId } from './errorJump'
import type { TermBlock } from './types'

function blk(id: string, exitCode: number | null, running = false): TermBlock {
  return { id, command: id, startedAt: 0, endedAt: running ? null : 1, exitCode, running, mode: 'html', lines: [], folded: false }
}

describe('failedIds', () => {
  it('keeps only finished non-zero-exit blocks, in order', () => {
    const blocks = [blk('a', 0), blk('b', 1), blk('c', null, true), blk('d', 2), blk('e', null)]
    expect(failedIds(blocks)).toEqual(['b', 'd'])
  })
})

describe('nextFailedId', () => {
  it('returns null for an empty list', () => {
    expect(nextFailedId([], null)).toBeNull()
    expect(nextFailedId([], 'x')).toBeNull()
  })
  it('starts at the first id when current is null', () => {
    expect(nextFailedId(['a', 'b', 'c'], null)).toBe('a')
  })
  it('advances to the next id', () => {
    expect(nextFailedId(['a', 'b', 'c'], 'a')).toBe('b')
  })
  it('wraps past the last id', () => {
    expect(nextFailedId(['a', 'b', 'c'], 'c')).toBe('a')
  })
  it('starts at the first id when current is not in the list', () => {
    expect(nextFailedId(['a', 'b', 'c'], 'zzz')).toBe('a')
  })
})
