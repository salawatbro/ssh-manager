import { isMac } from '../platform'

// Structural subset of KeyboardEvent that mapKey needs — kept here (not
// React's KeyboardEvent) so this module stays DOM/React-free and unit
// testable. A real KeyboardEvent is structurally assignable to this.
export interface RawKeyEvent {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  metaKey: boolean
  altKey: boolean
}

// Minimal control-key mapping for raw passthrough while a command is running
// (Enter, Tab, Backspace, Ctrl-<letter>). Printable single characters are
// handled by the caller. `Ctrl+Shift+J` is reserved for the off-mac
// error-jump chord (BlockTerminal's own chord handler, bound at the
// document) — narrowed to that exact combination, since a blanket
// "any Ctrl+Shift" reservation also swallows US-layout chords that need
// Shift to type, like Ctrl+_ (readline undo, 0x1F) and Ctrl+^ (0x1E). On
// macOS the app chord is ⌘⇧E (metaKey), which mapKey never special-cases —
// so no reservation is needed there.
export function mapKey(e: RawKeyEvent): string {
  if (e.key === 'Enter') return '\r'
  if (e.key === 'Tab') return '\t'
  if (e.key === 'Backspace') return '\x7f'
  if (!isMac && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'j') return ''
  if (e.ctrlKey && e.key.length === 1) return String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64)
  return ''
}
