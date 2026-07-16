import { isMac } from './platform'

// A logical keymap action. Tabs carry their 1-based index.
export type Action =
  | 'palette'
  | 'new-server'
  | 'split-v'
  | 'split-h'
  | 'close-pane'
  | 'next-tab'
  | 'prev-tab'
  | 'settings'
  | { tab: number }

// resolveAction maps a keydown to a logical action, platform-aware, or null.
// macOS: ⌘ (Meta) — ⌘K palette, ⌘N new, ⌘D/⌘⇧D split, ⌘W close, ⌘⇧]/⌘⇧[
// next/prev, ⌘1-9 tabs. Windows/Linux (FR-09.3, compile-only, runtime-untested
// — see docs/v0.5-notes.md): Ctrl+Shift+<letter> for letters (distinct letters,
// no double-modifier: split-h is Ctrl+Shift+E), Ctrl+<digit> for tabs.
export function resolveAction(e: KeyboardEvent): Action | null {
  if (e.isComposing) return null
  const k = e.key.toLowerCase()

  if (isMac) {
    if (!e.metaKey) return null
    const shift = e.shiftKey
    if (!shift && k === 'k') return 'palette'
    if (!shift && k === 'n') return 'new-server'
    if (k === 'd') return shift ? 'split-h' : 'split-v'
    if (!shift && k === 'w') return 'close-pane'
    if (shift && e.key === '}') return 'next-tab'
    if (shift && e.key === '{') return 'prev-tab'
    if (!shift && k >= '1' && k <= '9') return { tab: Number(k) }
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
  if (e.key === '}') return 'next-tab'
  if (e.key === '{') return 'prev-tab'
  return null
}
