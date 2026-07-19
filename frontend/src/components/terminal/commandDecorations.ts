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
  term.parser.registerOscHandler(133, (data) => {
    const b = term.buffer.active
    const line = b.baseY + b.cursorY
    if (data === 'A') {
      machine.push({ kind: 'A', line })
      const m = term.registerMarker(0)
      if (m) promptMarkers.push({ line, marker: m })
    } else if (data === 'B') {
      machine.push({ kind: 'B', line, col: b.cursorX })
    } else if (data === 'C') {
      machine.push({ kind: 'C', line, atMs: performance.now() })
    } else if (data.startsWith('D')) {
      const exit = Number(data.split(';')[1] ?? '0') || 0
      const block = machine.push({ kind: 'D', exit, atMs: performance.now() })
      if (block) drawCommandBlock(term, block)
    }
    return true // handled — do not print the sequence
  })
  return promptMarkers
}

// Draws the gutter bar for one finished command block, plus a ✗ + duration on
// the prompt line. Anchored to a fresh marker at the prompt line so it scrolls
// with the buffer and is disposed with the terminal.
export function drawCommandBlock(term: Terminal, block: Block): void {
  const active = term.buffer.active
  const height = Math.max(1, active.baseY + active.cursorY - block.promptLine)
  const marker = term.registerMarker(block.promptLine - (active.baseY + active.cursorY))
  if (!marker) return
  const failed = block.exit !== 0

  const bar = term.registerDecoration({ marker, x: 0, width: 1, height })
  bar?.onRender((el) => {
    el.style.background = failed ? 'var(--term-fail)' : 'var(--term-block)'
    el.style.opacity = failed ? '0.9' : '0.5'
    el.style.pointerEvents = 'none'
  })

  const badge = term.registerDecoration({ marker, x: 0, width: term.cols, height: 1 })
  badge?.onRender((el) => {
    el.style.pointerEvents = 'none'
    const right = document.createElement('span')
    right.textContent = (failed ? '✗ ' : '') + fmtMs(block.durationMs)
    right.style.cssText =
      `position:absolute;right:6px;top:0;font-size:11px;` +
      `color:${failed ? 'var(--term-fail)' : 'var(--term-dim)'};`
    el.appendChild(right)
  })
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
