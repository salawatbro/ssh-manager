import { describe, it, expect } from 'vitest'
import type { Tab } from '../stores/sessions'
import { focusedLeaf } from './paneFocus'

function tab(over: Partial<Tab> = {}): Tab {
  return {
    id: 't1',
    serverId: 's1',
    title: 'db-1',
    hostLabel: 'root@db.example.com',
    root: { kind: 'leaf', id: 'p1', serverId: 's1' },
    focusedPaneId: 'p1',
    startedAt: 0,
    ...over,
  }
}

describe('focusedLeaf', () => {
  it('returns null when no tab is active', () => {
    expect(focusedLeaf([tab()], null)).toBe(null)
  })

  it('returns null when activeTabId matches no tab', () => {
    expect(focusedLeaf([tab({ id: 't1' })], 't2')).toBe(null)
  })

  it('resolves the active tab\'s focused leaf', () => {
    const t = tab()
    expect(focusedLeaf([t], 't1')).toEqual({ kind: 'leaf', id: 'p1', serverId: 's1' })
  })

  it('finds the focused leaf inside a split tree', () => {
    const t = tab({
      root: {
        kind: 'split',
        id: 'sp1',
        dir: 'h',
        ratio: 0.5,
        a: { kind: 'leaf', id: 'p1', serverId: 's1' },
        b: { kind: 'leaf', id: 'p2', serverId: 's2' },
      },
      focusedPaneId: 'p2',
    })
    expect(focusedLeaf([t], 't1')).toEqual({ kind: 'leaf', id: 'p2', serverId: 's2' })
  })

  it('returns null when focusedPaneId matches no leaf', () => {
    expect(focusedLeaf([tab({ focusedPaneId: 'missing' })], 't1')).toBe(null)
  })
})
