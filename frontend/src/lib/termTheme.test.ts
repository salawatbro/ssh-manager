import { describe, expect, it, vi } from 'vitest'
import { findDecorations } from './termTheme'

// findDecorations() reads four --term-find-* custom properties, two of which
// (matchOverviewRuler, activeMatchColorOverviewRuler) are mandatory options
// for addon-search's registerDecoration. A stub that resolves them all to ''
// (as terminalFind.test.ts's stub does, for its own unrelated purpose) would
// let a renamed token in tokens.css pass every test in the suite while the
// addon silently loses highlighting or throws. This test uses real-looking
// values instead, so a broken lookup shows up as a wrong/missing value here.
// No jsdom in this project — stub just enough of the DOM API for
// getComputedStyle to work, same approach as terminalFind.test.ts.
vi.stubGlobal('document', { documentElement: {} })
vi.stubGlobal('getComputedStyle', () => ({
  getPropertyValue: (name: string) => {
    const tokens: Record<string, string> = {
      '--term-find-match': '#1f4a52',
      '--term-find-match-ruler': '#2a7c86',
      '--term-find-active': '#3aa0ff',
      '--term-find-active-ruler': '#9fe6ff',
    }
    return tokens[name] ?? ''
  },
}))

describe('findDecorations', () => {
  it('resolves all four --term-find-* tokens to non-empty values', () => {
    const decorations = findDecorations()
    expect(decorations).toEqual({
      matchBackground: '#1f4a52',
      matchOverviewRuler: '#2a7c86',
      activeMatchBackground: '#3aa0ff',
      activeMatchColorOverviewRuler: '#9fe6ff',
    })
    for (const value of Object.values(decorations)) {
      expect(value).not.toBe('')
    }
  })
})
