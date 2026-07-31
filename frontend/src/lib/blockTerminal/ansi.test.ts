import { describe, expect, it } from 'vitest'
import { createAnsiParser } from './ansi'

const flat = (lines: { text: string; cls: string }[][]) =>
  lines.map((l) => l.map((s) => s.text).join(''))

describe('createAnsiParser', () => {
  it('splits on newlines into lines', () => {
    const p = createAnsiParser()
    p.write('one\ntwo\nthree')
    expect(flat(p.lines())).toEqual(['one', 'two', 'three'])
  })

  it('applies SGR colour to a segment', () => {
    const p = createAnsiParser()
    p.write('\x1b[32mok\x1b[0m done')
    const l0 = p.lines()[0]
    expect(l0[0]).toEqual({ text: 'ok', cls: 'tc-grn' })
    expect(l0[1].text).toBe(' done')
    expect(l0[1].cls).toBe('')
  })

  it('carriage return overwrites the current line (progress bars)', () => {
    const p = createAnsiParser()
    p.write('50%\r100%')
    expect(flat(p.lines())).toEqual(['100%'])
  })

  it('flags a complex sequence (cursor addressing) as sawComplex', () => {
    const p = createAnsiParser()
    p.write('\x1b[2J\x1b[H')
    expect(p.sawComplex()).toBe(true)
  })

  it('does not flag plain SGR + newlines as complex', () => {
    const p = createAnsiParser()
    p.write('\x1b[1mbold\x1b[0m\nnext')
    expect(p.sawComplex()).toBe(false)
  })
})
