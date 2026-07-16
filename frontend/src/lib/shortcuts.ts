import { isMac } from './platform'

const mod = isMac ? '⌘' : 'Ctrl+Shift+'
const modP = isMac ? '⌘' : 'Ctrl+' // for digit/comma bindings

// The keymap the app actually binds (dizayn Shortcuts), for read-only display.
// Rebinding is a later version — this is a reference list, not an editor.
export const SHORTCUTS: { label: string; keys: string }[] = [
  { label: 'Command palette', keys: `${isMac ? '⌘' : 'Ctrl+Shift+'}K` },
  { label: 'New server', keys: `${isMac ? '⌘' : 'Ctrl+Shift+'}N` },
  { label: 'Settings', keys: `${modP},` },
  { label: 'Show / hide window', keys: '⌘⇧S' },
  { label: 'Split vertical / horizontal', keys: isMac ? '⌘D / ⌘⇧D' : 'Ctrl+Shift+D / Ctrl+Shift+E' },
  { label: 'Close pane', keys: `${mod}W` },
  { label: 'Switch to tab 1…9', keys: `${modP}1…9` },
  { label: 'Next / previous tab', keys: isMac ? '⌘⇧] / ⌘⇧[' : 'Ctrl+Shift+] / [' },
  { label: 'Find in terminal', keys: `${isMac ? '⌘' : 'Ctrl+Shift+'}F` },
]
