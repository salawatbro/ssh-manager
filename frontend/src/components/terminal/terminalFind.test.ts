import { describe, expect, it, vi } from 'vitest'
import { runFind, closeFind } from './terminalFind'
import type { SearchAddon } from '@xterm/addon-search'

// runFind's non-empty-query branch reads tokens.css via findDecorations(),
// which needs `document`. There's no jsdom in this project (DOM-touching
// code stays untested elsewhere too, e.g. termTheme.ts) — stub just enough
// of the DOM API for getComputedStyle to return empty strings, since only
// the branching under test here (findNext vs findPrevious, decorations
// always passed) depends on it, not the actual colour values.
vi.stubGlobal('document', { documentElement: {} })
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))

// A hand-rolled fake: runFind/closeFind only call these three methods, so a
// full SearchAddon instance is unnecessary.
function fakeSearch(): SearchAddon {
  return {
    clearDecorations: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn(),
  } as unknown as SearchAddon
}

describe('runFind', () => {
  it('is a no-op when there is no search addon yet', () => {
    const setFindResults = vi.fn()
    runFind(null, 'foo', 'next', setFindResults)
    expect(setFindResults).not.toHaveBeenCalled()
  })

  it('clears instead of searching when the query is empty', () => {
    const search = fakeSearch()
    const setFindResults = vi.fn()
    runFind(search, '', 'next', setFindResults)
    expect(search.clearDecorations).toHaveBeenCalledOnce()
    expect(setFindResults).toHaveBeenCalledWith(null)
    expect(search.findNext).not.toHaveBeenCalled()
  })

  it('searches forward with decorations enabled', () => {
    const search = fakeSearch()
    runFind(search, 'foo', 'next', vi.fn())
    expect(search.findNext).toHaveBeenCalledWith('foo', { decorations: expect.any(Object) })
    expect(search.findPrevious).not.toHaveBeenCalled()
  })

  it('searches backward with decorations enabled', () => {
    const search = fakeSearch()
    runFind(search, 'foo', 'prev', vi.fn())
    expect(search.findPrevious).toHaveBeenCalledWith('foo', { decorations: expect.any(Object) })
    expect(search.findNext).not.toHaveBeenCalled()
  })
})

describe('closeFind', () => {
  it('clears decorations, results, and closes the bar', () => {
    const search = fakeSearch()
    const setFindResults = vi.fn()
    const setFindOpen = vi.fn()
    closeFind(search, setFindResults, setFindOpen)
    expect(search.clearDecorations).toHaveBeenCalledOnce()
    expect(setFindResults).toHaveBeenCalledWith(null)
    expect(setFindOpen).toHaveBeenCalledWith(false)
  })

  it('tolerates a null search addon — closing never fails to clean up', () => {
    const setFindResults = vi.fn()
    const setFindOpen = vi.fn()
    closeFind(null, setFindResults, setFindOpen)
    expect(setFindResults).toHaveBeenCalledWith(null)
    expect(setFindOpen).toHaveBeenCalledWith(false)
  })
})
