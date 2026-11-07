import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store reads localStorage once at module init, so each test that cares
// about persistence loads a FRESH module copy with the stub already in place
// (same reset-modules pattern as lib/shortcuts.test.ts).
const backing: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => backing[k] ?? null,
  setItem: (k: string, v: string) => {
    backing[k] = v
  },
})

async function loadStore() {
  vi.resetModules()
  return (await import('./sidebar')).useSidebar
}

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k]
})

describe('sidebar store', () => {
  it('toggles a scope back to all servers', async () => {
    const useSidebar = await loadStore()
    useSidebar.getState().toggleScope({ kind: 'group', group: 'Prod' })
    expect(useSidebar.getState().scope).toEqual({ kind: 'group', group: 'Prod' })
    useSidebar.getState().toggleScope({ kind: 'tag', tag: 'Prod' })
    expect(useSidebar.getState().scope).toEqual({ kind: 'tag', tag: 'Prod' })
    useSidebar.getState().toggleScope({ kind: 'tag', tag: 'Prod' })
    expect(useSidebar.getState().scope).toEqual({ kind: 'all' })
  })

  it('persists the sort and ignores an unknown stored value', async () => {
    let useSidebar = await loadStore()
    expect(useSidebar.getState().sort).toBe('manual')
    useSidebar.getState().setSort('recent')
    useSidebar = await loadStore()
    expect(useSidebar.getState().sort).toBe('recent')
    backing['serverList.sort'] = 'sideways'
    useSidebar = await loadStore()
    expect(useSidebar.getState().sort).toBe('manual')
  })

  it('persists collapsed groups across a fresh load', async () => {
    let useSidebar = await loadStore()
    useSidebar.getState().toggleGroup('Prod')
    useSidebar.getState().toggleGroup('') // the ungrouped run collapses too
    expect(useSidebar.getState().collapsed).toEqual({ Prod: true, '': true })

    useSidebar = await loadStore()
    expect(useSidebar.getState().collapsed).toEqual({ Prod: true, '': true })

    useSidebar.getState().toggleGroup('Prod')
    useSidebar = await loadStore()
    expect(useSidebar.getState().collapsed).toEqual({ '': true })
  })

  it('starts expanded when the stored value is corrupted', async () => {
    backing['sidebar.collapsedGroups'] = '{not json'
    const useSidebar = await loadStore()
    expect(useSidebar.getState().collapsed).toEqual({})
  })

  it('ignores keys stored with a non-true value', async () => {
    backing['sidebar.collapsedGroups'] = '{"Prod": false, "Dev": true}'
    const useSidebar = await loadStore()
    expect(useSidebar.getState().collapsed).toEqual({ Dev: true })
  })
})
