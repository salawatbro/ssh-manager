import { describe, expect, it, vi } from 'vitest'
import { createBlockSession } from './blockSession'

const ESC = '\x1b', BEL = '\x07'

describe('createBlockSession', () => {
  it('submit adds history and writes line + CR', () => {
    const write = vi.fn()
    const s = createBlockSession({ write, newId: () => 'b0' })
    s.submit('ls -la')
    expect(write).toHaveBeenCalledWith('ls -la\r')
  })

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
