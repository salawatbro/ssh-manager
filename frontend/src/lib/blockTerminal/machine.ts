import { splitOsc133 } from './osc133'
import { createAnsiParser } from './ansi'
import { shouldAutoFold } from './foldPolicy'
import type { Segment, TermBlock } from './types'

const hasText = (lines: Segment[][]) => lines.some((l) => l.some((s) => s.text.length > 0))

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
  // The running block erased the screen and was pulled out of `blocks`. It is
  // detached rather than discarded: if it prints after erasing, it comes back.
  let detached = false

  const startBlock = () => {
    ansi = createAnsiParser()
    detached = false
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
        // Erase-display is `clear`. A block terminal's screen IS the block
        // list, so the whole list goes — including the block of the command
        // that did the erasing, so the pane ends up genuinely empty. That block
        // is only detached: a command that erases and THEN prints
        // (`tput clear; echo hi`) is re-attached below, in this write or a
        // later one. Checked before the complex flip: `clear` leads with ESC[H,
        // and only the parser knows the erase that followed retracted it.
        if (ansi.takeCleared()) {
          blocks.length = 0
          detached = true
        }
        cur.lines = ansi.lines()
        if (detached && hasText(cur.lines)) { blocks.push(cur); detached = false }
        if (ansi.sawComplex()) { cur.mode = 'xterm'; cur.raw = text } // seed with the chunk that flipped it
      } else {
        cur.raw = (cur.raw ?? '') + text // subsequent raw bytes for RawBlock to replay
      }
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
          if (cur) {
            cur.running = false; cur.exitCode = part.event.exit; cur.endedAt = Date.now()
            cur.folded = shouldAutoFold(cur)
          }
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
