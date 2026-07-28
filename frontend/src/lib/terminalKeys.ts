// The terminal's key policy, kept out of the component so it can be tested.
// App-combos are shortcuts and never terminal input (FR-09.1): on macOS that
// is any Cmd combo; elsewhere Ctrl+Shift+<key> and Ctrl+<digit> (FR-09.3) —
// plain Ctrl+C / Ctrl+D / Ctrl+W MUST reach the host, so they are not.
export type TerminalKeyAction =
  | 'find'
  | 'paste-native'
  | 'jump-prev'
  | 'jump-next'
  | 'drop'
  | 'pass'

// Only the fields the policy reads, so tests need no DOM.
export interface TerminalKeyEvent {
  type: string
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

export function terminalKeyAction(e: TerminalKeyEvent, mac: boolean): TerminalKeyAction {
  if (e.type !== 'keydown') return 'pass'
  const digit = /^[1-9]$/.test(e.key)
  const isAppCombo = mac
    ? e.metaKey
    : (e.ctrlKey && e.shiftKey) || (e.ctrlKey && !e.shiftKey && digit)
  if (!isAppCombo) return 'pass'
  switch (e.key.toLowerCase()) {
    case 'f':
      return 'find'
    case 'v':
      return 'paste-native'
    case 'arrowup':
      return 'jump-prev'
    case 'arrowdown':
      return 'jump-next'
    default:
      return 'drop'
  }
}
