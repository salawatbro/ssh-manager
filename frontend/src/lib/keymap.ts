import { isMac } from './platform'

// A logical keymap action. Tabs carry their 1-based index; snippetSlot carries
// the 1-9 quick-run slot (v0.7, FR-16).
export type Action =
  | 'palette'
  | 'new-server'
  | 'split-v'
  | 'split-h'
  | 'close-pane'
  | 'next-tab'
  | 'prev-tab'
  | 'settings'
  | 'snippets'
  | 'lock'
  | { tab: number }
  | { snippetSlot: number }

// Matches a shifted digit's e.code (Digit1..Digit9). Deliberately keyed off
// .code, not .key: Shift+1 yields e.key === '!' (US layout, and most others)
// so the plain `k >= '1' && k <= '9'` trick the no-shift tab check uses below
// would never see a digit once Shift is held. .code reports the physical key
// regardless of the Shift-shifted character it produces.
const DIGIT_CODE = /^Digit([1-9])$/

// resolveAction maps a keydown to a logical action, platform-aware, or null.
// macOS: ⌘ (Meta) — ⌘K palette, ⌘N new, ⌘E snippet palette, ⌘D/⌘⇧D split, ⌘W
// close, ⌘⇧]/⌘⇧[ next/prev, ⌘1-9 tabs (UNCHANGED), ⌘⇧1-9 snippet quick-slots
// (v0.7) — a distinct chord from plain ⌘1-9, so tab-switch keeps precedence
// with no conflict. Windows/Linux (FR-09.3, compile-only, runtime-untested —
// see docs/v0.5-notes.md): Ctrl+Shift+<letter> for letters (distinct letters,
// no double-modifier: split-h already owns Ctrl+Shift+E, so the v0.7 snippet
// palette uses Ctrl+Shift+S instead), Ctrl+<digit> for tabs, Ctrl+Shift+<digit>
// for snippet quick-slots (free — no existing Windows binding uses a digit).
export function resolveAction(e: KeyboardEvent): Action | null {
  if (e.isComposing) return null
  const k = e.key.toLowerCase()

  if (isMac) {
    if (!e.metaKey) return null
    const shift = e.shiftKey
    if (!shift && k === 'k') return 'palette'
    if (!shift && k === 'n') return 'new-server'
    if (!shift && k === 'e') return 'snippets'
    if (!shift && k === 'l') return 'lock'
    if (k === 'd') return shift ? 'split-h' : 'split-v'
    if (!shift && k === 'w') return 'close-pane'
    if (shift && e.key === '}') return 'next-tab'
    if (shift && e.key === '{') return 'prev-tab'
    if (!shift && k >= '1' && k <= '9') return { tab: Number(k) }
    if (shift) {
      const m = DIGIT_CODE.exec(e.code)
      if (m) return { snippetSlot: Number(m[1]) }
    }
    if (!shift && e.key === ',') return 'settings'
    return null
  }

  // Windows / Linux.
  if (e.ctrlKey && !e.shiftKey && !e.altKey && k >= '1' && k <= '9') return { tab: Number(k) }
  // Ctrl+, (no shift) is explicitly allowed by FR-09.3, so it's checked before
  // the Ctrl+Shift gate below, same as the Ctrl+digit tab case above.
  if (e.ctrlKey && !e.shiftKey && e.key === ',') return 'settings'
  if (!(e.ctrlKey && e.shiftKey)) return null
  if (k === 'k') return 'palette'
  if (k === 'n') return 'new-server'
  if (k === 'd') return 'split-v'
  if (k === 'e') return 'split-h'
  if (k === 'w') return 'close-pane'
  if (k === 's') return 'snippets'
  if (k === 'l') return 'lock'
  if (e.key === '}') return 'next-tab'
  if (e.key === '{') return 'prev-tab'
  const m = DIGIT_CODE.exec(e.code)
  if (m) return { snippetSlot: Number(m[1]) }
  return null
}
