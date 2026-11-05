import { describe, expect, it } from 'vitest'
import type { TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { sortTerminals, tabHint, terminalSelectOptions } from './terminalOptions'

const opt = (id: string, installed: boolean, extra: Partial<TerminalOption> = {}): TerminalOption => ({
  id,
  name: id,
  installed,
  supportsTab: false,
  needsAutomation: false,
  note: '',
  ...extra,
})

const list = [opt('terminal', true), opt('iterm2', false), opt('ghostty', true), opt('kitty', false), opt('custom', true)]

describe('terminal options', () => {
  it('puts installed apps first and custom last, keeping catalog order', () => {
    expect(sortTerminals(list).map((o) => o.id)).toEqual(['terminal', 'ghostty', 'iterm2', 'kitty', 'custom'])
  })

  it('labels and disables apps that are not installed, except the current one', () => {
    const sel = terminalSelectOptions(list, 'kitty')
    expect(sel.find((o) => o.value === 'iterm2')).toMatchObject({ label: 'iterm2 — Not installed', disabled: true })
    expect(sel.find((o) => o.value === 'kitty')).toMatchObject({ disabled: false })
    expect(sel.find((o) => o.value === 'terminal')).toMatchObject({ label: 'terminal', disabled: false })
  })

  it('explains tab support', () => {
    expect(tabHint(opt('terminal', true))).toBe('terminal can only open a new window.')
    expect(tabHint(opt('ghostty', true, { note: 'Tabs need Ghostty 1.3 or later.' }))).toBe('Tabs need Ghostty 1.3 or later.')
    expect(tabHint(opt('iterm2', true, { supportsTab: true, needsAutomation: true }))).toMatch(/Automation/)
    expect(tabHint(opt('wezterm', true, { supportsTab: true }))).toBe('')
    expect(tabHint(undefined)).toBe('')
  })
})
