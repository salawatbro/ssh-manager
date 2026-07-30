import { describe, it, expect } from 'vitest'
import {
  applyTransferProgress,
  formatEta,
  formatRate,
  type ProgressEvent,
  type TransferProgress,
} from './transferProgress'

const ev = (over: Partial<ProgressEvent>): ProgressEvent => ({
  transferID: 't1',
  direction: 'upload',
  currentFile: 'a.txt',
  done: 0,
  total: 100,
  rate: 0,
  finished: false,
  error: '',
  ...over,
})

describe('applyTransferProgress', () => {
  it('adds an in-flight transfer', () => {
    expect(applyTransferProgress([], ev({ done: 40, rate: 2048 }))).toEqual([
      { transferID: 't1', direction: 'upload', currentFile: 'a.txt', done: 40, total: 100, rate: 2048 },
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
      { transferID: 'a', direction: 'upload', currentFile: 'a', done: 1, total: 1, rate: 0 },
      { transferID: 'b', direction: 'download', currentFile: 'b', done: 1, total: 2, rate: 0 },
    ]
    expect(applyTransferProgress(running, ev({ transferID: 'a', finished: true })).map((t) => t.transferID)).toEqual(['b'])
  })

  it('carries the rate through', () => {
    expect(applyTransferProgress([], ev({ rate: 1_048_576 }))[0].rate).toBe(1_048_576)
  })
})

describe('formatRate', () => {
  it('scales bytes/sec to a readable unit', () => {
    expect(formatRate(512)).toBe('512 B/s')
    expect(formatRate(1024)).toBe('1.0 KB/s')
    expect(formatRate(1_048_576)).toBe('1.0 MB/s')
    expect(formatRate(13_000_000)).toBe('12 MB/s')
  })

  it('is blank with no measured rate', () => {
    expect(formatRate(0)).toBe('')
    expect(formatRate(-1)).toBe('')
  })
})

describe('formatEta', () => {
  it('reports the time left at the current rate', () => {
    expect(formatEta(80, 10)).toBe('8s')
    expect(formatEta(1250, 10)).toBe('2m 05s')
    expect(formatEta(10, 10)).toBe('1s')
  })

  it('is blank without a rate or remaining bytes', () => {
    expect(formatEta(100, 0)).toBe('')
    expect(formatEta(0, 10)).toBe('')
  })
})
