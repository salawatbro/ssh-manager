import type { Terminal, IMarker } from '@xterm/xterm'
import { createOsc133Machine, type CommandBlock as Block } from '../../lib/shellIntegration'

// One entry per OSC 133;A prompt seen so far, in terminal order. Read by
// Task 5 (jump-to-command) off `promptMarkersRef.current` in Terminal.tsx.
export type PromptMarker = { line: number; marker: IMarker }

// Registers the OSC 133 handler on `term` and feeds every A/B/C/D marker into
// a fresh `createOsc133Machine()`. Returns the ordered prompt-marker list,
// which the caller stores in its own ref (`promptMarkersRef.current = ...`)
// so it survives across renders. Kept out of Terminal.tsx to keep that file
// under its line budget — this is the only piece of shell-integration wiring
// that belongs to the client (Task 1 owns the machine/types, Task 3 owns the
// snippet injection).
export function installOsc133(term: Terminal): PromptMarker[] {
  const machine = createOsc133Machine()
  const promptMarkers: PromptMarker[] = []
  // Blocks are strictly sequential A→B→C→D, so the marker created at the
  // most recent 'A' IS the prompt marker for whichever block finalizes next
  // on 'D' — track it so drawCommandBlock can anchor to the REAL marker
  // (trim-safe: marker.line auto-adjusts as scrollback trims) instead of a
  // frozen line number.
  let lastPromptMarker: IMarker | undefined
  term.parser.registerOscHandler(133, (data) => {
    const b = term.buffer.active
    const line = b.baseY + b.cursorY
    if (data === 'A') {
      machine.push({ kind: 'A', line })
      const m = term.registerMarker(0)
      if (m) {
        promptMarkers.push({ line, marker: m })
        lastPromptMarker = m
      }
    } else if (data === 'B') {
      machine.push({ kind: 'B', line, col: b.cursorX })
    } else if (data === 'C') {
      machine.push({ kind: 'C', line, atMs: performance.now() })
    } else if (data.startsWith('D')) {
      const exit = Number(data.split(';')[1] ?? '0') || 0
      const block = machine.push({ kind: 'D', exit, atMs: performance.now() })
      if (block) drawCommandBlock(term, block, lastPromptMarker)
    }
    return true // handled — do not print the sequence
  })
  return promptMarkers
}

// Draws the gutter bar for one finished command block, plus a ✗ + duration on
// the prompt line. Anchored DIRECTLY to the block's own prompt IMarker (the
// one installOsc133 registered at OSC 133;A time) rather than a fresh marker
// derived from `block.promptLine` — that raw line number is frozen at 'A'
// time, so if scrollback trims before 'D' (long-running output) it goes
// stale while `marker.line` auto-adjusts. Bails if the marker is missing or
// was disposed (e.g. trimmed out of scrollback entirely).
export function drawCommandBlock(term: Terminal, block: Block, promptMarker: IMarker | undefined): void {
  if (!promptMarker || promptMarker.isDisposed) return
  const active = term.buffer.active
  const height = Math.max(1, active.baseY + active.cursorY - promptMarker.line)
  const failed = block.exit !== 0

  const bar = term.registerDecoration({ marker: promptMarker, x: 0, width: 1, height })
  bar?.onRender((el) => {
    // Draw the bar as a thin left-border shifted LEFT into the terminal's own
    // left padding (a gutter), so it never tints the first character cell.
    // xterm re-sets left/top/width/height on the element each render but NOT
    // border/background/transform — so these survive across render passes and
    // stay idempotent (no accumulation).
    el.style.background = 'transparent'
    el.style.borderLeft = `3px solid ${failed ? 'var(--term-fail)' : 'var(--term-block)'}`
    el.style.transform = 'translateX(-8px)'
    el.style.opacity = failed ? '0.95' : '0.55'
    el.style.pointerEvents = 'none'
  })

  const badge = term.registerDecoration({ marker: promptMarker, x: 0, width: term.cols, height: 1 })
  // Set textContent + styles on the decoration element itself (idempotent)
  // rather than appendChild-ing a new <span>: onRender re-fires on every
  // viewport render pass for the decoration's whole lifetime (even while
  // off-screen), so appendChild would accumulate an unbounded number of
  // overlapping DOM nodes over a session.
  badge?.onRender((el) => {
    el.style.pointerEvents = 'none'
    el.textContent = (failed ? '✗ ' : '') + fmtMs(block.durationMs)
    el.style.textAlign = 'right'
    el.style.paddingRight = '6px'
    el.style.fontSize = '11px'
    el.style.color = failed ? 'var(--term-fail)' : 'var(--term-dim)'
  })
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
