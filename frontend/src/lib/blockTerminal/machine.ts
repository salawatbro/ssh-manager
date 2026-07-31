import { splitOsc133 } from './osc133'
import { createAnsiParser } from './ansi'
import type { TermBlock } from './types'

// State machine turning a PTY byte stream into command blocks. States:
//  idle    — at/after a prompt (A seen, before C). Command text after B.
//  running — between C and D. Output flows into the current block.
// A block is created at C (or B if we prefer; here at C so pre-C noise is
// dropped). Complex output flips the block to mode 'xterm' (RawBlock renders
// the raw stream via the fallback path).
export function createBlockMachine(newId: () => string) {
  const blocks: TermBlock[] = []
  let pending = '' // trailing partial ESC held across chunk boundaries
  let phase: 'idle' | 'cmd' | 'running' = 'idle'
  let cmd = ''
  let cur: TermBlock | null = null
  let ansi = createAnsiParser()

  const startBlock = () => {
    ansi = createAnsiParser()
    cur = {
      id: newId(), command: cmd.trim(), startedAt: Date.now(), endedAt: null,
      exitCode: null, running: true, mode: 'html', lines: [], folded: false,
    }
    blocks.push(cur)
  }

  const absorb = (text: string) => {
    if (phase === 'cmd') { cmd += text; return } // echoed command → header
    if (phase === 'running' && cur) {
      if (cur.mode === 'html') {
        ansi.write(text)
        cur.lines = ansi.lines()
        if (ansi.sawComplex()) cur.mode = 'xterm' // hand off to RawBlock
      }
      // in xterm mode the raw bytes are consumed by RawBlock, not here
    }
    // idle text (banner before the first prompt) is dropped
  }

  function write(chunk: string) {
    const buf = pending + chunk
    // Hold a trailing partial OSC (ESC ] 133 ; … without BEL) for the next write.
    const cut = buf.lastIndexOf('\x1b]133;')
    let head = buf, tail = ''
    if (cut >= 0 && buf.indexOf('\x07', cut) < 0) { head = buf.slice(0, cut); tail = buf.slice(cut) }
    pending = tail

    for (const part of splitOsc133(head)) {
      if ('text' in part) { absorb(part.text); continue }
      switch (part.event.kind) {
        case 'A': phase = 'idle'; cmd = ''; cur = null; break
        case 'B': phase = 'cmd'; break
        case 'C': phase = 'running'; startBlock(); break
        case 'D':
          if (cur) { cur.running = false; cur.exitCode = part.event.exit; cur.endedAt = Date.now() }
          phase = 'idle'; break
      }
    }
  }

  return {
    write,
    rawTail: () => pending, // exposed for tests only
    blocks: () => blocks,
    running: () => phase === 'running',
    altScreen: () => !!cur && cur.running && cur.mode === 'xterm',
  }
}
