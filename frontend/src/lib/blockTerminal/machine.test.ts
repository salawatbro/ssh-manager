import { describe, expect, it } from 'vitest'
import { createBlockMachine } from './machine'

const ESC = '\x1b', BEL = '\x07'
const A = `${ESC}]133;A${BEL}`, B = `${ESC}]133;B${BEL}`, C = `${ESC}]133;C${BEL}`
const D = (n: number) => `${ESC}]133;D;${n}${BEL}`

let n = 0
const ids = () => `b${n++}`

describe('createBlockMachine', () => {
  it('forms a finished block from A→B(cmd)→C→output→D', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}ls -la${C}total 8\nfile.txt${D(0)}${A}`)
    const b = m.blocks()
    expect(b.length).toBe(1)
    expect(b[0].command).toBe('ls -la')
    expect(b[0].exitCode).toBe(0)
    expect(b[0].running).toBe(false)
    expect(b[0].lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['total 8', 'file.txt'])
  })

  it('marks a block running between C and D', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}sleep 5${B}${C}`)
    expect(m.running()).toBe(true)
    expect(m.blocks()[0].running).toBe(true)
    m.write(D(0))
    expect(m.running()).toBe(false)
  })

  it('captures a non-zero exit code', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}false${B}${C}${D(1)}`)
    expect(m.blocks()[0].exitCode).toBe(1)
  })

  it('flips a block to xterm mode when output is complex (alt-screen)', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}vim${B}${C}${ESC}[?1049h`)
    expect(m.blocks()[0].mode).toBe('xterm')
    expect(m.altScreen()).toBe(true)
  })

  it('survives an OSC 133 marker split across two writes', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}echo hi${B}${C}hi${ESC}]133;`)
    m.write(`D;0${BEL}`)
    expect(m.blocks()[0].running).toBe(false)
    expect(m.blocks()[0].exitCode).toBe(0)
  })

  it('retains raw bytes on an xterm-mode block', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}vim${C}${ESC}[?1049hSCREEN`)
    const b = m.blocks()[0]
    expect(b.mode).toBe('xterm')
    expect(b.raw).toContain('SCREEN')
    m.write('MORE')
    expect(m.blocks()[0].raw).toContain('MORE')
  })

  it('auto-folds a long finished block', () => {
    n = 0
    const m = createBlockMachine(ids)
    const many = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    m.write(`${A}${B}seq${C}${many}${D(0)}`)
    expect(m.blocks()[0].folded).toBe(true)
  })
})

describe('createBlockMachine clear', () => {
  it('leaves the pane completely empty — the erasing block goes too', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}ls${C}one\ntwo${D(0)}`)
    m.write(`${A}${B}echo hi${C}hi${D(0)}`)
    expect(m.blocks().length).toBe(2)
    // `clear`: ESC[H latches complex, ESC[2J/3J wipe the screen.
    m.write(`${A}${B}clear${C}${ESC}[H${ESC}[2J${ESC}[3J${D(0)}`)
    expect(m.blocks()).toEqual([])
  })

  it('starts a fresh block for the next command after a clear', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}ls${C}out${D(0)}`)
    m.write(`${A}${B}clear${C}${ESC}[H${ESC}[2J${D(0)}`)
    expect(m.blocks()).toEqual([])
    m.write(`${A}${B}echo hi${C}hi${D(0)}`)
    const b = m.blocks()
    expect(b.length).toBe(1)
    expect(b[0].command).toBe('echo hi')
    expect(b[0].lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['hi'])
  })

  // The erasing block is detached, not discarded: a command that erases and
  // THEN prints (`tput clear; echo hi`) must still show its output.
  it('re-attaches the erasing block when it prints after the erase', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}old${C}gone${D(0)}`)
    m.write(`${A}${B}redraw${C}${ESC}[2Jfresh${D(0)}`)
    const b = m.blocks()
    expect(b.length).toBe(1)
    expect(b[0].command).toBe('redraw')
    expect(b[0].mode).toBe('html') // NOT handed to xterm
    expect(b[0].exitCode).toBe(0)
    expect(b[0].lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['fresh'])
  })

  it('re-attaches when the print arrives in a later chunk than the erase', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}old${C}gone${D(0)}`)
    m.write(`${A}${B}slow${C}${ESC}[2J`)
    expect(m.blocks()).toEqual([])
    m.write('later')
    const b = m.blocks()
    expect(b.length).toBe(1)
    expect(b[0].lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['later'])
  })

  it('does not clear for an alt-screen program that erases inside its own screen', () => {
    n = 0
    const m = createBlockMachine(ids)
    m.write(`${A}${B}ls${C}out${D(0)}`)
    // Alt-screen flips the block to xterm first, so later erases are raw bytes.
    m.write(`${A}${B}vim${C}${ESC}[?1049h${ESC}[2J`)
    const b = m.blocks()
    expect(b.length).toBe(2)
    expect(b[1].mode).toBe('xterm')
  })
})

describe('createBlockMachine completion probe', () => {
  const S = `${ESC}]933;S${BEL}`, E = `${ESC}]933;E${BEL}`

  it('forms no block and reports candidates', () => {
    n = 0
    const got: string[][] = []
    const m = createBlockMachine(ids, (c) => got.push(c))
    m.write(`${A}${B}ls${C}out${D(0)}`)
    m.expectProbe()
    m.write(`${A}${B}probe${C}${S}a.txt\nassets/\n${E}${D(0)}`)
    expect(m.blocks()).toHaveLength(1)
    expect(got).toEqual([['a.txt', 'assets/']])
  })

  it('never looks running while a probe is in flight', () => {
    const m = createBlockMachine(ids)
    m.expectProbe()
    m.write(`${A}${B}probe${C}`)
    expect(m.running()).toBe(false)
    expect(m.blocks()).toEqual([])
  })

  it('suppresses helper errors and reports an empty result', () => {
    const got: string[][] = []
    const m = createBlockMachine(ids, (c) => got.push(c))
    m.expectProbe()
    m.write(`${A}${B}probe${C}command not found${D(127)}`)
    expect(m.blocks()).toEqual([])
    expect(got).toEqual([[]])
  })

  it('survives a split OSC 933 marker', () => {
    const got: string[][] = []
    const m = createBlockMachine(ids, (c) => got.push(c))
    m.expectProbe()
    m.write(`${A}${B}p${C}${S}one\n${ESC}]933;`)
    m.write(`E${BEL}${D(0)}`)
    expect(got).toEqual([['one']])
  })

  it('joins a candidate split across frames and normalises PTY CRLF', () => {
    const got: string[][] = []
    const m = createBlockMachine(ids, (c) => got.push(c))
    m.expectProbe()
    m.write(`${A}${B}p${C}${S}long-fi`)
    m.write(`le.txt\r\ndir/\r\n${E}${D(0)}`)
    expect(got).toEqual([['long-file.txt', 'dir/']])
  })

  it('returns to normal blocks after a probe', () => {
    const m = createBlockMachine(ids)
    m.expectProbe()
    m.write(`${A}${B}p${C}${S}${E}${D(0)}`)
    m.write(`${A}${B}echo hi${C}hi${D(0)}`)
    expect(m.blocks().map((b) => b.command)).toEqual(['echo hi'])
  })

  it('counts repeated expectations before either probe starts', () => {
    const got: string[][] = []
    const m = createBlockMachine(ids, (c) => got.push(c))
    m.expectProbe(); m.expectProbe()
    m.write(`${A}${B}p1${C}${S}one\n${E}${D(0)}`)
    m.write(`${A}${B}p2${C}${S}two\n${E}${D(0)}`)
    expect(got).toEqual([['one'], ['two']])
    expect(m.blocks()).toEqual([])
  })

  it('cancelProbe clears one pending expectation', () => {
    const m = createBlockMachine(ids)
    m.expectProbe(); m.cancelProbe()
    m.write(`${A}${B}echo hi${C}hi${D(0)}`)
    expect(m.blocks()[0].command).toBe('echo hi')
  })

  it('does not let a completion probe consume the next submitted command', () => {
    const m = createBlockMachine(ids)
    m.expectCommand('cd /srv')
    m.expectProbe()
    m.write(`${A}${B}probe${C}${S}${E}${D(0)}`)
    m.write(`${A}${B}${C}${D(0)}`)
    expect(m.blocks()[0].command).toBe('cd /srv')
  })
})

describe('createBlockMachine submitted command source', () => {
  it('uses the client-submitted command when PTY echo is empty', () => {
    const m = createBlockMachine(ids)
    m.expectCommand('cd /srv')
    m.write(`${A}${B}${C}${D(0)}`)
    expect(m.blocks()[0].command).toBe('cd /srv')
  })

  it('falls back to PTY echo when there is no submitted command', () => {
    const m = createBlockMachine(ids)
    m.write(`${A}${B}echo from-shell${C}${D(0)}`)
    expect(m.blocks()[0].command).toBe('echo from-shell')
  })
})
