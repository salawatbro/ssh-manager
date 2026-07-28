import { describe, expect, it } from 'vitest'
import { terminalKeyAction, type TerminalKeyEvent } from './terminalKeys'

function ev(over: Partial<TerminalKeyEvent>): TerminalKeyEvent {
  return { type: 'keydown', key: 'a', metaKey: false, ctrlKey: false, shiftKey: false, ...over }
}

describe('terminalKeyAction on macOS', () => {
  it('lets the browser paste on Cmd+V instead of reading the clipboard', () => {
    // Load-bearing: a programmatic clipboard read is gated behind macOS's
    // paste confirmation, so this must never become a "we read it" action.
    expect(terminalKeyAction(ev({ key: 'v', metaKey: true }), true)).toBe('paste-native')
  })

  it('opens find on Cmd+F', () => {
    expect(terminalKeyAction(ev({ key: 'f', metaKey: true }), true)).toBe('find')
  })

  it('jumps between commands on Cmd+Up / Cmd+Down', () => {
    expect(terminalKeyAction(ev({ key: 'ArrowUp', metaKey: true }), true)).toBe('jump-prev')
    expect(terminalKeyAction(ev({ key: 'ArrowDown', metaKey: true }), true)).toBe('jump-next')
  })

  it('drops every other Cmd combo so it never reaches the pty', () => {
    expect(terminalKeyAction(ev({ key: 's', metaKey: true }), true)).toBe('drop')
  })

  it('passes plain Ctrl+C through to the host', () => {
    expect(terminalKeyAction(ev({ key: 'c', ctrlKey: true }), true)).toBe('pass')
  })

  it('ignores anything that is not a keydown', () => {
    expect(terminalKeyAction(ev({ type: 'keyup', key: 'v', metaKey: true }), true)).toBe('pass')
  })
})

describe('terminalKeyAction off macOS', () => {
  it('treats Ctrl+Shift+V as the paste combo', () => {
    expect(terminalKeyAction(ev({ key: 'v', ctrlKey: true, shiftKey: true }), false)).toBe('paste-native')
  })

  it('treats Ctrl+<digit> as an app combo', () => {
    expect(terminalKeyAction(ev({ key: '3', ctrlKey: true }), false)).toBe('drop')
  })

  it('leaves plain Ctrl+V to the host', () => {
    expect(terminalKeyAction(ev({ key: 'v', ctrlKey: true }), false)).toBe('pass')
  })
})
