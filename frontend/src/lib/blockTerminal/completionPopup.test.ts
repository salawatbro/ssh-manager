import { describe, expect, it } from 'vitest'
import {
  COMPLETION_POPUP_MAX,
  filterCompletionCandidates,
  moveCompletionSelection,
} from './completionPopup'

describe('filterCompletionCandidates', () => {
  const candidates = ['api.go', 'api.test.ts', 'app.ts', 'API.md', 'assets/']

  it('keeps only case-sensitive prefix matches', () => {
    expect(filterCompletionCandidates(candidates, 'api.')).toEqual(['api.go', 'api.test.ts'])
  })

  it('returns all candidates for an empty prefix and none for no match', () => {
    expect(filterCompletionCandidates(candidates, '')).toEqual(candidates)
    expect(filterCompletionCandidates(candidates, 'zzz')).toEqual([])
  })
})

describe('moveCompletionSelection', () => {
  it('wraps in both directions', () => {
    expect(moveCompletionSelection(2, 1, 3)).toBe(0)
    expect(moveCompletionSelection(0, -1, 3)).toBe(2)
  })

  it('never selects beyond the visible popup cap', () => {
    expect(moveCompletionSelection(COMPLETION_POPUP_MAX - 1, 1, 100)).toBe(0)
  })

  it('stays at zero for an empty list', () => {
    expect(moveCompletionSelection(0, 1, 0)).toBe(0)
  })
})
