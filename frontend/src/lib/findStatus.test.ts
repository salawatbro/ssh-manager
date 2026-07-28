import { describe, expect, it } from 'vitest'
import { formatFindStatus } from './findStatus'

describe('formatFindStatus', () => {
  it('shows nothing at all for an empty query', () => {
    // An untouched find bar must not accuse itself of failing.
    expect(formatFindStatus('', null)).toBe('')
    expect(formatFindStatus('', { resultIndex: 0, resultCount: 3 })).toBe('')
  })

  it('shows a one-based position and the total', () => {
    expect(formatFindStatus('err', { resultIndex: 0, resultCount: 12 })).toBe('1/12')
    expect(formatFindStatus('err', { resultIndex: 2, resultCount: 12 })).toBe('3/12')
  })

  it('reports no matches', () => {
    expect(formatFindStatus('err', { resultIndex: -1, resultCount: 0 })).toBe('no matches')
    expect(formatFindStatus('err', null)).toBe('no matches')
  })

  it('reports the over-limit case the addon signals with resultIndex -1', () => {
    // The addon returns -1 for resultIndex once highlightLimit (1000) is
    // exceeded; the count is still meaningful, the position is not.
    expect(formatFindStatus('e', { resultIndex: -1, resultCount: 1000 })).toBe('1000+')
  })
})
