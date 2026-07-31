import type { Osc133ByteEvent } from './types'

// Matches one OSC 133 marker: ESC ] 133 ; <A|B|C|D[;exit]> BEL. Only 133 is
// consumed; any other OSC (title, etc.) is left in the text stream for the
// ANSI parser (which strips the ones it knows) or for xterm in a fallback.
const OSC133 = /\x1b\]133;([ABCD])(?:;(-?\d+))?\x07/g

export type Osc133Part = { text: string } | { event: Osc133ByteEvent }

// Splits a chunk into interleaved plain-text runs and OSC 133 events, with the
// 133 markers removed. Empty text runs are dropped.
export function splitOsc133(chunk: string): Osc133Part[] {
  const out: Osc133Part[] = []
  let last = 0
  OSC133.lastIndex = 0
  for (let m = OSC133.exec(chunk); m; m = OSC133.exec(chunk)) {
    if (m.index > last) out.push({ text: chunk.slice(last, m.index) })
    const kind = m[1] as 'A' | 'B' | 'C' | 'D'
    if (kind === 'D') out.push({ event: { kind: 'D', exit: Number(m[2] ?? 0) } })
    else out.push({ event: { kind } })
    last = m.index + m[0].length
  }
  if (last < chunk.length) out.push({ text: chunk.slice(last) })
  return out
}
