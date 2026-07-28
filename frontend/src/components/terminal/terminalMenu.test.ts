import { describe, expect, it, vi } from 'vitest'
import { terminalMenuItems } from './terminalMenu'
import type { Terminal } from '@xterm/xterm'

// A hand-rolled fake: terminalMenuItems only calls these five methods, so a
// full xterm instance (and the DOM it needs) is unnecessary.
function fakeTerm(hasSelection: boolean): Terminal {
  return {
    hasSelection: () => hasSelection,
    getSelection: () => 'selected text',
    selectAll: vi.fn(),
    clear: vi.fn(),
    paste: vi.fn(),
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
})
