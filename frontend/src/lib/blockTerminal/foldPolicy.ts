import type { Segment, TermBlock } from './types'

export const FOLD_THRESHOLD = 40 // finished blocks longer than this auto-fold
export const FOLD_TAIL = 12 // lines kept visible when folded

export function shouldAutoFold(block: TermBlock): boolean {
  return !block.running && block.lines.length > FOLD_THRESHOLD
}

export function visibleLines(block: TermBlock): Segment[][] {
  if (!block.folded) return block.lines
  return block.lines.slice(Math.max(0, block.lines.length - FOLD_TAIL))
}

export function hasVisibleOutput(block: TermBlock): boolean {
  if (block.mode === 'xterm') return true
  return block.lines.some((line) => line.some((segment) => segment.text.length > 0))
}

export function foldLabel(block: TermBlock): string {
  const hidden = Math.max(0, block.lines.length - FOLD_TAIL)
  return `${hidden} lines folded`
}

export function copyText(block: TermBlock): string {
  return block.lines.map((l) => l.map((s) => s.text).join('')).join('\n')
}
