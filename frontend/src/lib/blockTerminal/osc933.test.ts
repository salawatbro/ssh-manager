import { describe, expect, it } from 'vitest'
import { splitOsc933 } from './osc933'

const S = '\x1b]933;S\x07', E = '\x1b]933;E\x07'

describe('splitOsc933', () => {
  it('returns plain text untouched as a single part', () => {
    expect(splitOsc933('hello')).toEqual([{ text: 'hello' }])
  })
  it('splits markers out of the surrounding text', () => {
    expect(splitOsc933(`${S}a.txt\nb.txt\n${E}`)).toEqual([
      { marker: 'S' },
      { text: 'a.txt\nb.txt\n' },
      { marker: 'E' },
    ])
  })
  it('drops empty text runs', () => {
    expect(splitOsc933(`${S}${E}`)).toEqual([{ marker: 'S' }, { marker: 'E' }])
  })
  it('leaves an OSC 133 marker in the text stream for the other scanner', () => {
    const osc133 = '\x1b]133;D;0\x07'
    expect(splitOsc933(osc133)).toEqual([{ text: osc133 }])
  })
  it('ignores a malformed 933 marker', () => {
    expect(splitOsc933('\x1b]933;X\x07')).toEqual([{ text: '\x1b]933;X\x07' }])
  })
  it('does not leak lastIndex between calls', () => {
    splitOsc933(`${S}x${E}`)
    expect(splitOsc933(`${S}y${E}`)).toEqual([{ marker: 'S' }, { text: 'y' }, { marker: 'E' }])
  })
})
