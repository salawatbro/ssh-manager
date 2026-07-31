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

describe('createAnsiParser erase-display', () => {
  // `clear` emits ESC[H ESC[2J ESC[3J. The ESC[H alone would latch `complex`
  // and hand the block to xterm, so the erase has to both wipe the grid and
  // retract that latch — everything before a full-screen erase is moot.
  it('treats ESC[2J as a clear: wipes the grid and clears the complex latch', () => {
    const p = createAnsiParser()
    p.write('old output\n\x1b[H\x1b[2J\x1b[3J')
    expect(p.takeCleared()).toBe(true)
    expect(flat(p.lines())).toEqual([''])
    expect(p.sawComplex()).toBe(false)
  })

  it('keeps text written after the erase in the same chunk', () => {
    const p = createAnsiParser()
    p.write('gone\n\x1b[2Jkept')
    expect(p.takeCleared()).toBe(true)
    expect(flat(p.lines())).toEqual(['kept'])
  })

  it('takeCleared is consumed, not a latch', () => {
    const p = createAnsiParser()
    p.write('\x1b[2J')
    expect(p.takeCleared()).toBe(true)
    expect(p.takeCleared()).toBe(false)
  })

  it('leaves partial erases (ESC[0J / ESC[1J / ESC[J) complex — prompts redraw with those', () => {
    for (const seq of ['\x1b[0J', '\x1b[1J', '\x1b[J']) {
      const p = createAnsiParser()
      p.write(`x${seq}`)
      expect(p.takeCleared(), seq).toBe(false)
      expect(p.sawComplex(), seq).toBe(true)
    }
  })

  it('still flips to complex for cursor addressing that follows an erase', () => {
    const p = createAnsiParser()
    p.write('\x1b[2J\x1b[10;5H')
    expect(p.takeCleared()).toBe(true)
    expect(p.sawComplex()).toBe(true)
  })
})

describe('createAnsiParser alt-screen vs erase', () => {
  // Regression: vim/htop send ESC[?1049h and ESC[2J in ONE write. If the erase
  // retracted `complex` there, the block would never reach xterm and the caller
  // would wipe the block list instead of rendering the app.
  it('alt-screen enter survives an erase in the same chunk', () => {
    for (const enter of ['\x1b[?1049h', '\x1b[?1047h', '\x1b[?47h']) {
      const p = createAnsiParser()
      p.write(`${enter}\x1b[2J\x1b[H`)
      expect(p.sawComplex(), enter).toBe(true)
      expect(p.takeCleared(), enter).toBe(false)
    }
  })

  it('consumes the alt-screen sequence instead of leaking it as text', () => {
    const p = createAnsiParser()
    p.write('\x1b[?1049h')
    expect(flat(p.lines())).toEqual([''])
  })
})
