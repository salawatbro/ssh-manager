import { describe, expect, it } from 'vitest'
import { FOLD_THRESHOLD, copyText, foldLabel, shouldAutoFold, visibleLines } from './foldPolicy'
import type { TermBlock } from './types'

const mk = (nLines: number, folded = false): TermBlock => ({
  id: 'b', command: 'seq', startedAt: 0, endedAt: 1, exitCode: 0, running: false,
  mode: 'html', folded, lines: Array.from({ length: nLines }, (_, i) => [{ text: `line ${i}`, cls: '' }]),
})

describe('foldPolicy', () => {
  it('auto-folds a finished block over the threshold', () => {
    expect(shouldAutoFold(mk(FOLD_THRESHOLD + 1))).toBe(true)
    expect(shouldAutoFold(mk(FOLD_THRESHOLD))).toBe(false)
  })
  it('does not auto-fold a running block', () => {
    expect(shouldAutoFold({ ...mk(999), running: true, endedAt: null })).toBe(false)
  })
  it('folded shows only the tail', () => {
    const v = visibleLines(mk(100, true))
    expect(v.length).toBeLessThan(100)
    expect(v[v.length - 1][0].text).toBe('line 99')
  })
  it('copyText strips styling and joins with newlines', () => {
    const b = mk(2)
    b.lines = [[{ text: 'a', cls: 'tc-grn' }, { text: 'b', cls: '' }], [{ text: 'c', cls: '' }]]
    expect(copyText(b)).toBe('ab\nc')
  })
  it('foldLabel reports the hidden count', () => {
    expect(foldLabel(mk(100, true))).toMatch(/lines folded/)
  })
})
