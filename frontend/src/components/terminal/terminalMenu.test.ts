import { describe, expect, it, vi } from 'vitest'
import { terminalMenuItems } from './terminalMenu'
import type { Terminal } from '@xterm/xterm'

// The native paste action, stubbed: calling the real binding would need the
// Wails runtime, and what matters here is that Paste routes through it rather
// than reading the clipboard itself.
vi.mock('@bindings/github.com/salawat/sshmgr', () => ({
  EditService: { Paste: vi.fn() },
}))

// A hand-rolled fake: terminalMenuItems only calls these six methods, so a
// full xterm instance (and the DOM it needs) is unnecessary.
function fakeTerm(hasSelection: boolean): Terminal {
  return {
    hasSelection: () => hasSelection,
    getSelection: () => 'selected text',
    selectAll: vi.fn(),
    clear: vi.fn(),
    paste: vi.fn(),
    focus: vi.fn(),
  } as unknown as Terminal
}

describe('terminalMenuItems', () => {
  it('disables Copy when there is no selection', () => {
    const items = terminalMenuItems(fakeTerm(false))
    const copy = items[0]
    if (copy === 'separator') throw new Error('expected Copy entry')
    expect(copy.label).toBe('Copy')
    expect(copy.disabled).toBe(true)
  })

  it('enables Copy when there is a selection', () => {
    const items = terminalMenuItems(fakeTerm(true))
    const copy = items[0]
    if (copy === 'separator') throw new Error('expected Copy entry')
    expect(copy.disabled).toBe(false)
  })

  it('lists entries in the expected order', () => {
    const items = terminalMenuItems(fakeTerm(true))
    const labels = items.map((it) => (it === 'separator' ? 'separator' : it.label))
    expect(labels).toEqual(['Copy', 'Paste', 'separator', 'Select All', 'Clear'])
  })

  it('invokes the terminal methods for Select All and Clear', () => {
    const term = fakeTerm(true)
    const items = terminalMenuItems(term)
    const selectAll = items[3]
    const clear = items[4]
    if (selectAll === 'separator' || clear === 'separator') throw new Error('expected entries')
    selectAll.run()
    clear.run()
    expect(term.selectAll).toHaveBeenCalledOnce()
    expect(term.clear).toHaveBeenCalledOnce()
  })

  it('focuses the terminal before asking AppKit to paste', async () => {
    // Order is load-bearing: paste: travels the responder chain, and clicking
    // the menu button had moved focus off the terminal. It must never go back
    // to reading the clipboard here — macOS gates that behind a prompt.
    const { EditService } = await import('@bindings/github.com/salawat/sshmgr')
    const term = fakeTerm(true)
    const paste = terminalMenuItems(term)[1]
    if (paste === 'separator') throw new Error('expected Paste entry')
    paste.run()
    expect(term.focus).toHaveBeenCalledOnce()
    expect(EditService.Paste).toHaveBeenCalledOnce()
  })
})
