import { describe, expect, it } from 'vitest'
import { splitOsc133 } from './osc133'

const ESC = '\x1b', BEL = '\x07'
const A = `${ESC}]133;A${BEL}`, B = `${ESC}]133;B${BEL}`, C = `${ESC}]133;C${BEL}`
const D = (n: number) => `${ESC}]133;D;${n}${BEL}`

describe('splitOsc133', () => {
  it('extracts A/B/C/D events and strips the markers', () => {
    const parts = splitOsc133(`${A}${B}ls -la${C}total 8${D(0)}`)
    expect(parts).toEqual([
      { event: { kind: 'A' } },
      { event: { kind: 'B' } },
      { text: 'ls -la' },
      { event: { kind: 'C' } },
      { text: 'total 8' },
      { event: { kind: 'D', exit: 0 } },
    ])
  })

  it('parses a non-zero exit code', () => {
    const parts = splitOsc133(D(127))
    expect(parts).toEqual([{ event: { kind: 'D', exit: 127 } }])
  })

  it('passes plain text through untouched', () => {
    expect(splitOsc133('plain output\nline 2')).toEqual([{ text: 'plain output\nline 2' }])
  })

  it('ignores an unrelated OSC (e.g. title) — leaves it in the text run', () => {
    const s = `${ESC}]0;my title${BEL}hi`
    expect(splitOsc133(s)).toEqual([{ text: s }])
  })
})
