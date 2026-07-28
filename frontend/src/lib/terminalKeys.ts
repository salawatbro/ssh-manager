// The terminal's key policy, kept out of the component so it can be tested.
// App-combos are shortcuts and never terminal input (FR-09.1): on macOS that
// is any Cmd combo; elsewhere Ctrl+Shift+<key> and Ctrl+<digit> (FR-09.3) —
// plain Ctrl+C / Ctrl+D / Ctrl+W MUST reach the host, so they are not.
type TerminalKeyKind =
  | 'find'
  | 'paste-native'
  | 'jump-prev'
  | 'jump-next'
  | 'drop'
  | 'pass'

// The action plus whether the caller must call preventDefault. Bundling the
// two means "prevent or not" is a value the tests can assert on, rather than
// a branch the component gets to decide on its own — that branch is exactly
// where the Cmd+V paste bug used to live (preventDefault + a programmatic
// clipboard read, which macOS 15+ gates behind a confirmation button).
export interface TerminalKeyDecision {
  action: TerminalKeyKind
  preventDefault: boolean
}

// Only the fields the policy reads, so tests need no DOM.
export interface TerminalKeyEvent {
  type: string
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

export function terminalKeyAction(e: TerminalKeyEvent, mac: boolean): TerminalKeyDecision {
  if (e.type !== 'keydown') return { action: 'pass', preventDefault: false }
  const digit = /^[1-9]$/.test(e.key)
  const isAppCombo = mac
    ? e.metaKey
    : (e.ctrlKey && e.shiftKey) || (e.ctrlKey && !e.shiftKey && digit)
  if (!isAppCombo) return { action: 'pass', preventDefault: false }
  switch (e.key.toLowerCase()) {
    case 'f':
      return { action: 'find', preventDefault: true }
    case 'v':
      // NOT preventing default is the fix: letting WebKit perform the native
      // paste means xterm's own paste listener delivers it to the pty. The
      // previous code preventDefault()'d and read the clipboard itself,
      // which macOS 15+ gates behind a "Paste" confirmation button.
      return { action: 'paste-native', preventDefault: false }
    case 'arrowup':
      return { action: 'jump-prev', preventDefault: true }
    case 'arrowdown':
      return { action: 'jump-next', preventDefault: true }
    default:
      // NOT preventing default here keeps native Cmd+C copy working for any
      // unmatched app combo — the pre-existing behavior, preserved.
      return { action: 'drop', preventDefault: false }
  }
}
