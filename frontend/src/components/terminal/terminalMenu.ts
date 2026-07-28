import type { Terminal } from '@xterm/xterm'
import type { MenuEntry } from '../ui/ContextMenu'

// The terminal's right-click menu entries. Extracted out of Terminal.tsx to
// keep that file under its line budget, and because the Copy disabled-state
// rule below is worth testing on its own.
export function terminalMenuItems(term: Terminal): MenuEntry[] {
  return [
    {
      label: 'Copy',
      disabled: !term.hasSelection(),
      run: () => void navigator.clipboard.writeText(term.getSelection()).catch(() => {}),
    },
    {
      // No native paste path for a menu item inside WKWebView (unlike the
      // Cmd+V key handler), so this still goes through the Clipboard API and
      // shows the macOS permission prompt. That is expected, not a bug.
      label: 'Paste',
      run: () => void navigator.clipboard.readText().then((t) => term.paste(t)).catch(() => {}),
    },
    'separator',
    { label: 'Select All', run: () => term.selectAll() },
    { label: 'Clear', run: () => term.clear() },
  ]
}
