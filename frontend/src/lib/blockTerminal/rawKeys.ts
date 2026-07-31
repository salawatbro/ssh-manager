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

// Control keys that genuinely need Shift to type on a US layout, so they must
// reach the PTY even though they arrive as Ctrl+Shift: Ctrl+_ (readline undo,
// 0x1F), Ctrl+^ (0x1E), Ctrl+@ (NUL, 0x00).
const SHIFTED_CONTROLS = '_^@'

// Minimal control-key mapping for raw passthrough while a command is running
// (Enter, Tab, Backspace, Ctrl-<letter>). Printable single characters are
// handled by the caller.
//
// Off-mac, Ctrl+Shift is the app's whole chord space (keymap.ts binds
// Ctrl+Shift+{K,N,D,E,W,S,L,[,],digit} and BlockTerminal's error jump takes
// Ctrl+Shift+J), so those combinations are reserved rather than written to the
// PTY — otherwise one keypress both runs the app action AND injects a control
// byte (Ctrl+Shift+D would send EOT and could close the shell). The reservation
// is an allow-list, not a blanket: SHIFTED_CONTROLS still pass through. On
// macOS the app chords are all ⌘-based, which mapKey never special-cases, so
// nothing is reserved there.
export function mapKey(e: RawKeyEvent): string {
  if (e.key === 'Enter') return '\r'
  if (e.key === 'Tab') return '\t'
  if (e.key === 'Backspace') return '\x7f'
  if (!isMac && e.ctrlKey && e.shiftKey && !SHIFTED_CONTROLS.includes(e.key)) return ''
  if (e.ctrlKey && e.key.length === 1) return String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64)
  return ''
}
