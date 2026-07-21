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
  it('toggles tags on and off', async () => {
    const useSidebar = await loadStore()
    useSidebar.getState().toggleTag('db')
    useSidebar.getState().toggleTag('web')
    expect(useSidebar.getState().tags).toEqual(['db', 'web'])
    useSidebar.getState().toggleTag('db')
    expect(useSidebar.getState().tags).toEqual(['web'])
  })

  it('clearFilter resets query and tags', async () => {
    const useSidebar = await loadStore()
    useSidebar.getState().setQuery('prod')
    useSidebar.getState().toggleTag('db')
    useSidebar.getState().clearFilter()
    expect(useSidebar.getState().query).toBe('')
    expect(useSidebar.getState().tags).toEqual([])
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
