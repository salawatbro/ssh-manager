import { isMac } from './platform'

const mod = isMac ? '⌘' : 'Ctrl+Shift+'
const modP = isMac ? '⌘' : 'Ctrl+' // for the comma binding

// The keymap the app actually binds (dizayn Shortcuts), for read-only display.
// Rebinding is a later version — this is a reference list, not an editor.
export const SHORTCUTS: { label: string; keys: string }[] = [
  { label: 'Command palette', keys: `${mod}K` },
  { label: 'New server', keys: `${mod}N` },
  { label: 'Settings', keys: `${modP},` },
  { label: 'Show / hide window', keys: '⌘⇧S' },
  { label: 'Lock Zish', keys: `${mod}L` },
]
