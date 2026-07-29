import type { Terminal } from '@xterm/xterm'
import type { MenuEntry } from '../ui/ContextMenu'
import { EditService } from '@bindings/github.com/salawat/sshmgr'

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
      // Asks AppKit to perform its own paste: action rather than reading the
      // clipboard here — since macOS 15 a programmatic read is gated behind a
      // confirmation button, while a real paste command is not. The focus call
      // matters: clicking this menu button moved focus to the button, and the
      // action is delivered down the responder chain to whatever is focused.
      label: 'Paste',
      run: () => {
        term.focus()
        void EditService.Paste()
      },
    },
    'separator',
    { label: 'Select All', run: () => term.selectAll() },
    { label: 'Clear', run: () => term.clear() },
  ]
}
