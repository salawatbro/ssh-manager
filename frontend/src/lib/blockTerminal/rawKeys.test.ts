import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RawKeyEvent } from './rawKeys'

// mapKey reads isMac at call time via the platform module, so each platform
// case needs the mock in place before a fresh module graph loads — same
// pattern as lib/shortcuts.test.ts.
async function loadWith(isMac: boolean) {
  vi.resetModules()
  vi.doMock('../platform', () => ({ isMac }))
  const mod = await import('./rawKeys')
  return mod.mapKey
}

afterEach(() => {
  vi.doUnmock('../platform')
})

function key(init: Partial<RawKeyEvent>): RawKeyEvent {
  return { key: '', ctrlKey: false, shiftKey: false, metaKey: false, altKey: false, ...init }
}

describe('mapKey', () => {
  it('maps Enter, Tab, Backspace', async () => {
    const mapKey = await loadWith(false)
    expect(mapKey(key({ key: 'Enter' }))).toBe('\r')
    expect(mapKey(key({ key: 'Tab' }))).toBe('\t')
    expect(mapKey(key({ key: 'Backspace' }))).toBe('\x7f')
  })

  it('maps Ctrl+C to 0x03', async () => {
    const mapKey = await loadWith(false)
    expect(mapKey(key({ key: 'c', ctrlKey: true }))).toBe('\x03')
  })

  it('regression: Ctrl+Shift+_ still produces 0x1F (readline undo)', async () => {
    const mapKey = await loadWith(false)
    expect(mapKey(key({ key: '_', ctrlKey: true, shiftKey: true }))).toBe('\x1f')
  })

  it('regression: Ctrl+Shift+^ and Ctrl+Shift+@ still pass through', async () => {
    const mapKey = await loadWith(false)
    expect(mapKey(key({ key: '^', ctrlKey: true, shiftKey: true }))).toBe('\x1e')
    expect(mapKey(key({ key: '@', ctrlKey: true, shiftKey: true }))).toBe('\x00')
  })

  it('reserves Ctrl+Shift+J on non-mac for the error-jump chord', async () => {
    const mapKey = await loadWith(false)
    expect(mapKey(key({ key: 'J', ctrlKey: true, shiftKey: true }))).toBe('')
  })

  // Off-mac, Ctrl+Shift is the app's whole chord space (keymap.ts). Letting one
  // through would both run the app action and inject a control byte —
  // Ctrl+Shift+D as EOT could close the shell.
  it('reserves the other off-mac Ctrl+Shift app chords instead of writing to the PTY', async () => {
    const mapKey = await loadWith(false)
    for (const k of ['D', 'W', 'L', 'C', 'K', 'N', 'E', 'S']) {
      expect(mapKey(key({ key: k, ctrlKey: true, shiftKey: true })), k).toBe('')
    }
  })

  it('does not reserve Ctrl+Shift+J on macOS — ordinary Ctrl-letter mapping applies', async () => {
    const mapKey = await loadWith(true)
    expect(mapKey(key({ key: 'J', ctrlKey: true, shiftKey: true }))).toBe('\n')
  })
})
