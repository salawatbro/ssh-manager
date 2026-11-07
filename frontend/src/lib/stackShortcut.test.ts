import { describe, expect, it } from 'vitest'
import { recordShortcut, shortcutError, shortcutLabel, type KeyLike } from './stackShortcut'

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
})

describe('recordShortcut', () => {
  it('reads the key by position, in canonical order', () => {
    expect(recordShortcut(key('Digit1', { metaKey: true, altKey: true }))).toEqual({ shortcut: 'alt+cmd+1' })
    expect(recordShortcut(key('KeyK', { metaKey: true, shiftKey: true, ctrlKey: true }))).toEqual({ shortcut: 'ctrl+shift+cmd+k' })
  })

  it('waits while only modifiers are down', () => {
    expect(recordShortcut(key('MetaLeft', { metaKey: true }))).toEqual({ pending: true })
    expect(recordShortcut(key('AltRight', { altKey: true }))).toEqual({ pending: true })
  })

  it('refuses keys and combinations a stack cannot use', () => {
    expect(recordShortcut(key('F5', { metaKey: true, altKey: true }))).toHaveProperty('error')
    expect(recordShortcut(key('Digit1', { metaKey: true }))).toHaveProperty('error')
    // Plain Ctrl+letter belongs to readline; ⌃⇧ alone still is not enough.
    expect(recordShortcut(key('KeyA', { ctrlKey: true, shiftKey: true }))).toHaveProperty('error')
    expect(recordShortcut(key('KeyS', { metaKey: true, shiftKey: true }))).toEqual({ error: '⇧⌘S already shows and hides Zish.' })
  })
})

describe('shortcutError and shortcutLabel', () => {
  it('matches the backend rules', () => {
    expect(shortcutError('alt+cmd+1')).toBeNull()
    expect(shortcutError('ctrl+alt+x')).toBeNull()
    expect(shortcutError('cmd+1')).not.toBeNull()
  })

  it('spells shortcuts the macOS way', () => {
    expect(shortcutLabel('alt+cmd+1')).toBe('⌥⌘1')
    expect(shortcutLabel('ctrl+shift+cmd+k')).toBe('⌃⇧⌘K')
    expect(shortcutLabel('')).toBe('')
  })
})

describe('the launcher shortcut', () => {
  it('records Space only when the field allows it', () => {
    const space = { space: true }
    expect(recordShortcut(key('Space', { altKey: true }), space)).toEqual({ shortcut: 'alt+space' })
    expect(recordShortcut(key('Space', { metaKey: true, ctrlKey: true }), space)).toEqual({ shortcut: 'ctrl+cmd+space' })
    expect(recordShortcut(key('Space', { altKey: true }))).toHaveProperty('error')
    expect(recordShortcut(key('Space', { ctrlKey: true }), space)).toEqual({ error: 'Hold ⌘ or ⌥ with Space.' })
    expect(recordShortcut(key('Space'), space)).toHaveProperty('error')
    // A letter still needs two modifiers.
    expect(recordShortcut(key('KeyL', { altKey: true }), space)).toHaveProperty('error')
    expect(recordShortcut(key('KeyL', { altKey: true, metaKey: true }), space)).toEqual({ shortcut: 'alt+cmd+l' })
  })

  it('spells Space', () => {
    expect(shortcutLabel('alt+space')).toBe('⌥Space')
  })
})
