import { describe, expect, it, vi } from 'vitest'
import { createBlockSession } from './blockSession'

const ESC = '\x1b', BEL = '\x07'

describe('createBlockSession', () => {
  it('feed drives the machine and exposes blocks', () => {
    const write = vi.fn()
    const s = createBlockSession({ write, newId: (() => { let n = 0; return () => `b${n++}` })() })
    // feed takes decoded text here (the real caller decodes base64 first).
    // OSC 133 marker order per the machine's contract (see machine.test.ts):
    // A (prompt) → B (command start) → command text → C (executed) → output → D (finished).
    s.feedText(`${ESC}]133;A${BEL}${ESC}]133;B${BEL}ls${ESC}]133;C${BEL}out${ESC}]133;D;0${BEL}`)
    const snap = s.snapshot()
    expect(snap.blocks.length).toBe(1)
    expect(snap.blocks[0].command).toBe('ls')
  })

  it('sendRaw writes bytes straight through', () => {
    const write = vi.fn()
    const s = createBlockSession({ write, newId: () => 'b0' })
    s.sendRaw('\x03') // Ctrl-C
    expect(write).toHaveBeenCalledWith('\x03')
  })
})

let n = 0
const newId = () => `b${n++}`

describe('blockSession submit/rerun', () => {
  it('submit(line) writes line + CR and routes through the guard', () => {
    const writes: string[] = []
    const guarded: string[] = []
    const s = createBlockSession({
      write: (d) => writes.push(d),
      newId,
      guard: (line, send) => { guarded.push(line); send() },
    })
    s.submit('ls -la')
    expect(guarded).toEqual(['ls -la'])
    expect(writes).toEqual(['ls -la\r'])
  })

  it('submit without a guard writes directly', () => {
    const writes: string[] = []
    const s = createBlockSession({ write: (d) => writes.push(d), newId })
    s.submit('pwd')
    expect(writes).toEqual(['pwd\r'])
  })

  it('rerun(command) behaves exactly like submit(command)', () => {
    const writes: string[] = []
    const guarded: string[] = []
    const s = createBlockSession({
      write: (d) => writes.push(d),
      newId,
      guard: (line, send) => { guarded.push(line); send() },
    })
    s.rerun('make build')
    expect(guarded).toEqual(['make build'])
    expect(writes).toEqual(['make build\r'])
  })

  it('a guard that never calls send() suppresses the write', () => {
    const writes: string[] = []
    const s = createBlockSession({ write: (d) => writes.push(d), newId, guard: vi.fn() })
    s.submit('rm -rf /')
    expect(writes).toEqual([])
  })

  it('submitted commands are recalled by historyUp (newest first)', () => {
    const s = createBlockSession({ write: () => {}, newId })
    s.submit('one')
    s.rerun('two')
    expect(s.historyUp('')).toBe('two')
    expect(s.historyUp('two')).toBe('one')
  })
})
