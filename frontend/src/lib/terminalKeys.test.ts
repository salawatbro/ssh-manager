import { describe, expect, it } from 'vitest'
import { terminalKeyAction, type TerminalKeyEvent } from './terminalKeys'

function ev(over: Partial<TerminalKeyEvent>): TerminalKeyEvent {
  return { type: 'keydown', key: 'a', metaKey: false, ctrlKey: false, shiftKey: false, ...over }
}

describe('terminalKeyAction on macOS', () => {
  it('regression guard: Cmd+V must not preventDefault, so WebKit performs the native paste', () => {
    // Load-bearing: if this ever flips to preventDefault: true, whoever put a
    // programmatic navigator.clipboard.readText() back in Terminal.tsx would
    // trip macOS's paste confirmation button again. Asserting the flag here
    // (not just the action name) is what makes that regression impossible to
    // reintroduce silently.
    const decision = terminalKeyAction(ev({ key: 'v', metaKey: true }), true)
    expect(decision.action).toBe('paste-native')
    expect(decision.preventDefault).toBe(false)
  })

  it('opens find on Cmd+F', () => {
    const decision = terminalKeyAction(ev({ key: 'f', metaKey: true }), true)
    expect(decision.action).toBe('find')
    expect(decision.preventDefault).toBe(true)
  })

  it('jumps between commands on Cmd+Up / Cmd+Down', () => {
    expect(terminalKeyAction(ev({ key: 'ArrowUp', metaKey: true }), true)).toEqual({
      action: 'jump-prev',
      preventDefault: true,
    })
    expect(terminalKeyAction(ev({ key: 'ArrowDown', metaKey: true }), true)).toEqual({
      action: 'jump-next',
      preventDefault: true,
    })
  })

  it('drops every other Cmd combo so it never reaches the pty, without preventing default', () => {
    // preventDefault: false here is what keeps native Cmd+C copy working.
    expect(terminalKeyAction(ev({ key: 's', metaKey: true }), true)).toEqual({
      action: 'drop',
      preventDefault: false,
    })
  })

  it('passes plain Ctrl+C through to the host', () => {
    expect(terminalKeyAction(ev({ key: 'c', ctrlKey: true }), true)).toEqual({
      action: 'pass',
      preventDefault: false,
    })
  })

  it('ignores anything that is not a keydown', () => {
    expect(terminalKeyAction(ev({ type: 'keyup', key: 'v', metaKey: true }), true)).toEqual({
      action: 'pass',
      preventDefault: false,
    })
  })
})

describe('terminalKeyAction off macOS', () => {
  it('treats Ctrl+Shift+V as the paste combo — asserts current behaviour, not correctness', () => {
    // Unsupported and unverified: the app ships macOS-only, so this path has never been exercised
    // for real. WebKitGTK doesn't treat Ctrl+Shift+V as a paste accelerator, so 'paste-native'
    // here does not actually deliver a paste off macOS — no native paste event fires, so nothing
    // reaches the pty, unlike the pre-fix code's clipboard read. If this app is ever ported,
    // terminalKeyAction needs a platform-aware action instead of this fallthrough.
    const decision = terminalKeyAction(ev({ key: 'v', ctrlKey: true, shiftKey: true }), false)
    expect(decision.action).toBe('paste-native')
    expect(decision.preventDefault).toBe(false)
  })

  it('treats Ctrl+Shift+F as the find combo', () => {
    expect(terminalKeyAction(ev({ key: 'f', ctrlKey: true, shiftKey: true }), false)).toEqual({
      action: 'find',
      preventDefault: true,
    })
  })

  it('treats Ctrl+Shift+ArrowUp as the jump-prev combo', () => {
    expect(terminalKeyAction(ev({ key: 'ArrowUp', ctrlKey: true, shiftKey: true }), false)).toEqual({
      action: 'jump-prev',
      preventDefault: true,
    })
  })

  it('treats Ctrl+<digit> as an app combo', () => {
    expect(terminalKeyAction(ev({ key: '3', ctrlKey: true }), false)).toEqual({
      action: 'drop',
      preventDefault: false,
    })
  })

  it('leaves plain Ctrl+V to the host', () => {
    expect(terminalKeyAction(ev({ key: 'v', ctrlKey: true }), false)).toEqual({
      action: 'pass',
      preventDefault: false,
    })
  })
})
