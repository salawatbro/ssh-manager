// Private OSC code 933 — the sibling of the 133 shell-integration markers this
// terminal already speaks. It delimits the candidate payload printed by the
// __zish_comp helper (shellSnippets.ts), so the completion probe is recognised
// by what the SHELL emitted, never by parsing the echoed command line (that
// text is raw terminal echo and can carry \r/\b/ESC from a prompt repaint).
const OSC933 = /\x1b\]933;([SE])\x07/g

export type Osc933Part = { text: string } | { marker: 'S' | 'E' }

// Splits a chunk into interleaved plain-text runs and 933 markers, with the
// markers removed. Empty text runs are dropped. Anything else — including OSC
// 133 — passes through untouched as text.
export function splitOsc933(chunk: string): Osc933Part[] {
  const out: Osc933Part[] = []
  let last = 0
  OSC933.lastIndex = 0
  for (let m = OSC933.exec(chunk); m; m = OSC933.exec(chunk)) {
    if (m.index > last) out.push({ text: chunk.slice(last, m.index) })
    out.push({ marker: m[1] as 'S' | 'E' })
    last = m.index + m[0].length
  }
  if (last < chunk.length) out.push({ text: chunk.slice(last) })
  return out
}
