import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Action } from './keymap'

// SHORTCUTS (the Settings cheat-sheet) and keymap.ts (the real bindings) are
// two hand-maintained surfaces with nothing tying them together. This test is
// that tie: every cheat-sheet row is pinned to its display string AND, where
// keymap.ts owns the binding, to the action resolveAction actually returns
// for the advertised chord. Adding, removing or rebinding a shortcut must
// update this table — that forced touch is the point.
//
// Rows with no probes are advertised in the cheat-sheet but bound elsewhere:
// "Show / hide window" is the native cgo hotkey (global_hotkey_darwin.go) and
// "Find in terminal" is bound inside Terminal.tsx, not keymap.ts.

// Both modules read `isMac` at import time, so each platform run needs the
// mock in place before a fresh module graph loads.
async function loadWith(isMac: boolean) {
  vi.resetModules()
  vi.doMock('./platform', () => ({ isMac }))
  const keymap = await import('./keymap')
  const shortcuts = await import('./shortcuts')
  return { resolveAction: keymap.resolveAction, SHORTCUTS: shortcuts.SHORTCUTS }
}

afterEach(() => {
  vi.doUnmock('./platform')
})

// A minimal keydown stand-in — resolveAction only reads these fields.
function key(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    isComposing: false,
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent
}

type Row = { label: string; keys: string; probes: { event: KeyboardEvent; action: Action }[] }

const MAC: Row[] = [
  { label: 'Command palette', keys: '⌘K', probes: [{ event: key({ metaKey: true, key: 'k' }), action: 'palette' }] },
  { label: 'New server', keys: '⌘N', probes: [{ event: key({ metaKey: true, key: 'n' }), action: 'new-server' }] },
  { label: 'Settings', keys: '⌘,', probes: [{ event: key({ metaKey: true, key: ',' }), action: 'settings' }] },
  { label: 'Show / hide window', keys: '⌘⇧S', probes: [] },
  {
    label: 'Split vertical / horizontal',
    keys: '⌘D / ⌘⇧D',
    probes: [
      { event: key({ metaKey: true, key: 'd' }), action: 'split-v' },
      { event: key({ metaKey: true, shiftKey: true, key: 'd' }), action: 'split-h' },
    ],
  },
  { label: 'Close pane', keys: '⌘W', probes: [{ event: key({ metaKey: true, key: 'w' }), action: 'close-pane' }] },
  { label: 'Switch to tab 1…9', keys: '⌘1…9', probes: [{ event: key({ metaKey: true, key: '4' }), action: { tab: 4 } }] },
  {
    label: 'Next / previous tab',
    keys: '⌘⇧] / ⌘⇧[',
    probes: [
      { event: key({ metaKey: true, shiftKey: true, key: '}' }), action: 'next-tab' },
      { event: key({ metaKey: true, shiftKey: true, key: '{' }), action: 'prev-tab' },
    ],
  },
  { label: 'Find in terminal', keys: '⌘F', probes: [] },
  { label: 'Jump to failed command', keys: '⌘⇧E', probes: [] },
  { label: 'Snippet palette', keys: '⌘E', probes: [{ event: key({ metaKey: true, key: 'e' }), action: 'snippets' }] },
  {
    label: 'Run snippet quick-slot 1…9',
    keys: '⌘⇧1…9',
    // Shift+7 delivers key '&' (US layout); the binding is keyed off e.code.
    probes: [{ event: key({ metaKey: true, shiftKey: true, key: '&', code: 'Digit7' }), action: { snippetSlot: 7 } }],
  },
  { label: 'Lock Zish', keys: '⌘L', probes: [{ event: key({ metaKey: true, key: 'l' }), action: 'lock' }] },
]

const WIN: Row[] = [
  { label: 'Command palette', keys: 'Ctrl+Shift+K', probes: [{ event: key({ ctrlKey: true, shiftKey: true, key: 'k' }), action: 'palette' }] },
  { label: 'New server', keys: 'Ctrl+Shift+N', probes: [{ event: key({ ctrlKey: true, shiftKey: true, key: 'n' }), action: 'new-server' }] },
  { label: 'Settings', keys: 'Ctrl+,', probes: [{ event: key({ ctrlKey: true, key: ',' }), action: 'settings' }] },
  // The cheat-sheet shows the mac chord even off-mac (the global hotkey is
  // mac-only cgo); pinned as-is so a fix here is a conscious one.
  { label: 'Show / hide window', keys: '⌘⇧S', probes: [] },
  {
    label: 'Split vertical / horizontal',
    keys: 'Ctrl+Shift+D / Ctrl+Shift+E',
    probes: [
      { event: key({ ctrlKey: true, shiftKey: true, key: 'd' }), action: 'split-v' },
      { event: key({ ctrlKey: true, shiftKey: true, key: 'e' }), action: 'split-h' },
    ],
  },
  { label: 'Close pane', keys: 'Ctrl+Shift+W', probes: [{ event: key({ ctrlKey: true, shiftKey: true, key: 'w' }), action: 'close-pane' }] },
  { label: 'Switch to tab 1…9', keys: 'Ctrl+1…9', probes: [{ event: key({ ctrlKey: true, key: '4' }), action: { tab: 4 } }] },
  {
    label: 'Next / previous tab',
    keys: 'Ctrl+Shift+] / [',
    probes: [
      { event: key({ ctrlKey: true, shiftKey: true, key: '}' }), action: 'next-tab' },
      { event: key({ ctrlKey: true, shiftKey: true, key: '{' }), action: 'prev-tab' },
    ],
  },
  { label: 'Find in terminal', keys: 'Ctrl+Shift+F', probes: [] },
  { label: 'Jump to failed command', keys: 'Ctrl+Shift+J', probes: [] },
  { label: 'Snippet palette', keys: 'Ctrl+Shift+S', probes: [{ event: key({ ctrlKey: true, shiftKey: true, key: 's' }), action: 'snippets' }] },
  {
    label: 'Run snippet quick-slot 1…9',
    keys: 'Ctrl+Shift+1…9',
    probes: [{ event: key({ ctrlKey: true, shiftKey: true, key: '&', code: 'Digit7' }), action: { snippetSlot: 7 } }],
  },
  { label: 'Lock Zish', keys: 'Ctrl+Shift+L', probes: [{ event: key({ ctrlKey: true, shiftKey: true, key: 'l' }), action: 'lock' }] },
]

for (const [name, isMac, rows] of [
  ['macOS', true, MAC],
  ['Windows/Linux', false, WIN],
] as const) {
  describe(`shortcuts ↔ keymap sync (${name})`, () => {
    it('lists exactly the known shortcuts, in order', async () => {
      const { SHORTCUTS } = await loadWith(isMac)
      expect(SHORTCUTS.map((s) => s.label)).toEqual(rows.map((r) => r.label))
    })

    it('shows the chord each binding actually uses', async () => {
      const { SHORTCUTS } = await loadWith(isMac)
      for (const row of rows) {
        const entry = SHORTCUTS.find((s) => s.label === row.label)
        expect(entry?.keys, row.label).toBe(row.keys)
      }
    })

    it('resolves each advertised chord to its action', async () => {
      const { resolveAction } = await loadWith(isMac)
      for (const row of rows) {
        for (const probe of row.probes) {
          expect(resolveAction(probe.event), `${row.label} (${row.keys})`).toEqual(probe.action)
        }
      }
    })
  })
}
