import { useEffect } from 'react'
import { resolveAction } from '../lib/keymap'
import { usePalette } from '../stores/palette'
import { useSettings } from '../stores/settings'
import { useSnippets } from '../stores/snippets'
import { useGuard } from '../stores/guard'

// App-level hotkeys, always active (not terminal-scoped): open the palette and
// New server. Uses the shared resolveAction so macOS ⌘K/⌘N and Windows
// Ctrl+Shift+K/N stay in one place.
export function useAppKeymap(onNewServer: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const action = resolveAction(e)
      // Never stack a palette over an open guard confirmation.
      if (action === 'palette' && !useGuard.getState().open) {
        e.preventDefault()
        usePalette.getState().toggle()
      } else if (action === 'new-server' && !usePalette.getState().open) {
        e.preventDefault()
        onNewServer()
      } else if (action === 'settings') {
        e.preventDefault()
        useSettings.getState().show()
      } else if (action === 'snippets' && !usePalette.getState().open && !useGuard.getState().open) {
        e.preventDefault()
        useSnippets.getState().show()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onNewServer])
}
