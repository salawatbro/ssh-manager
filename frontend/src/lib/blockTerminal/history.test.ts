import { describe, expect, it } from 'vitest'
import { createHistory } from './history'

describe('createHistory', () => {
  it('walks up then down through entries', () => {
    const h = createHistory()
    h.add('ls'); h.add('cd /srv'); h.add('git status')
    expect(h.up('')).toBe('git status')
    expect(h.up('')).toBe('cd /srv')
    expect(h.up('')).toBe('ls')
    expect(h.up('')).toBe('ls') // clamped at oldest
    expect(h.down()).toBe('cd /srv')
    expect(h.down()).toBe('git status')
    expect(h.down()).toBe('') // back to the live line
  })

  it('dedupes consecutive duplicates and ignores blanks', () => {
    const h = createHistory()
    h.add('ls'); h.add('ls'); h.add('   '); h.add('pwd')
    expect(h.up('')).toBe('pwd')
    expect(h.up('')).toBe('ls')
    expect(h.up('')).toBe('ls')
  })

  it('exposes a defensive newest-first snapshot', () => {
    const h = createHistory()
    h.add('one'); h.add('two')
    const snapshot = h.items()
    snapshot.push('mutated')
    expect(h.items()).toEqual(['two', 'one'])
  })
})
