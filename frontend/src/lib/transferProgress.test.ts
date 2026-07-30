import { describe, it, expect } from 'vitest'
import { applyTransferProgress, type ProgressEvent, type TransferProgress } from './transferProgress'

const ev = (over: Partial<ProgressEvent>): ProgressEvent => ({
  transferID: 't1',
  direction: 'upload',
  currentFile: 'a.txt',
  done: 0,
  total: 100,
  finished: false,
  error: '',
  ...over,
})

describe('applyTransferProgress', () => {
  it('adds an in-flight transfer', () => {
    expect(applyTransferProgress([], ev({ done: 40 }))).toEqual([
      { transferID: 't1', direction: 'upload', currentFile: 'a.txt', done: 40, total: 100 },
    ])
  })

  it('upserts by id — a later frame replaces the earlier one, not stacks', () => {
    const first = applyTransferProgress([], ev({ done: 40 }))
    const second = applyTransferProgress(first, ev({ done: 90 }))
    expect(second).toHaveLength(1)
    expect(second[0].done).toBe(90)
  })

  it('keeps separate transfers side by side', () => {
    const a = applyTransferProgress([], ev({ transferID: 'a' }))
    const both = applyTransferProgress(a, ev({ transferID: 'b' }))
    expect(both.map((t) => t.transferID)).toEqual(['a', 'b'])
  })

  it('drops a transfer once it finishes', () => {
    const running: TransferProgress[] = [
      { transferID: 'a', direction: 'upload', currentFile: 'a', done: 1, total: 1 },
      { transferID: 'b', direction: 'download', currentFile: 'b', done: 1, total: 2 },
    ]
    expect(applyTransferProgress(running, ev({ transferID: 'a', finished: true })).map((t) => t.transferID)).toEqual(['b'])
  })
})
