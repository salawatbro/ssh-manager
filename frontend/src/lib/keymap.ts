import { isMac } from './platform'

// A logical keymap action.
export type Action = 'palette' | 'new-server' | 'settings' | 'lock'

// resolveAction maps a keydown to a logical action, platform-aware, or null.
// macOS: ⌘K palette, ⌘N new server, ⌘, settings, ⌘L lock. Windows/Linux
// (FR-09.3, compile-only, runtime-untested — see docs/v0.5-notes.md):
// Ctrl+Shift+<letter> for letters (plain Ctrl+<letter> is readline's), and
// Ctrl+, for settings.
export function resolveAction(e: KeyboardEvent): Action | null {
  if (e.isComposing) return null
  const k = e.key.toLowerCase()

  if (isMac) {
    if (!e.metaKey || e.shiftKey) return null
    if (k === 'k') return 'palette'
    if (k === 'n') return 'new-server'
    if (k === 'l') return 'lock'
    if (e.key === ',') return 'settings'
    return null
  }

  // Ctrl+, (no shift) is explicitly allowed by FR-09.3, so it's checked before
  // the Ctrl+Shift gate below.
  if (e.ctrlKey && !e.shiftKey && e.key === ',') return 'settings'
  if (!(e.ctrlKey && e.shiftKey)) return null
  if (k === 'k') return 'palette'
  if (k === 'n') return 'new-server'
  if (k === 'l') return 'lock'
  return null
}
