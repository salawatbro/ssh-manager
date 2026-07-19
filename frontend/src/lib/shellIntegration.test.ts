import { describe, it, expect } from 'vitest'
import { createOsc133Machine } from './shellIntegration'

describe('createOsc133Machine', () => {
  it('finalizes a block on a full A→B→C→D cycle', () => {
    const m = createOsc133Machine()
    expect(m.push({ kind: 'A', line: 10 })).toBeNull()
    expect(m.push({ kind: 'B', line: 10, col: 15 })).toBeNull()
    expect(m.push({ kind: 'C', line: 10, atMs: 1000 })).toBeNull()
    const b = m.push({ kind: 'D', exit: 0, atMs: 3300 })
    expect(b).toEqual({
      promptLine: 10, commandLine: 10, commandCol: 15,
      outputLine: 10, exit: 0, durationMs: 2300,
    })
  })

  it('captures a non-zero exit code', () => {
    const m = createOsc133Machine()
    m.push({ kind: 'A', line: 5 }); m.push({ kind: 'B', line: 5, col: 12 })
    m.push({ kind: 'C', line: 5, atMs: 100 })
    expect(m.push({ kind: 'D', exit: 1, atMs: 400 })!.exit).toBe(1)
  })

  it('ignores a D with no preceding C (spurious first precmd)', () => {
    const m = createOsc133Machine()
    m.push({ kind: 'A', line: 1 })
    expect(m.push({ kind: 'D', exit: 0, atMs: 50 })).toBeNull()
  })

  it('discards a partial block when a new A arrives', () => {
    const m = createOsc133Machine()
    m.push({ kind: 'A', line: 1 }); m.push({ kind: 'B', line: 1, col: 2 })
    // new prompt before C/D — abandon the partial
    expect(m.push({ kind: 'A', line: 3 })).toBeNull()
    m.push({ kind: 'B', line: 3, col: 2 }); m.push({ kind: 'C', line: 3, atMs: 0 })
    expect(m.push({ kind: 'D', exit: 0, atMs: 10 })!.promptLine).toBe(3)
  })

  it('never returns a negative duration', () => {
    const m = createOsc133Machine()
    m.push({ kind: 'A', line: 1 }); m.push({ kind: 'B', line: 1, col: 2 })
    m.push({ kind: 'C', line: 1, atMs: 500 })
    expect(m.push({ kind: 'D', exit: 0, atMs: 100 })!.durationMs).toBe(0)
  })
})
