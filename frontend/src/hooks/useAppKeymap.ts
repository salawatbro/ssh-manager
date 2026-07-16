import { useEffect } from 'react'
import { resolveAction } from '../lib/keymap'
import { usePalette } from '../stores/palette'
import { useSettings } from '../stores/settings'

// App-level hotkeys, always active (not terminal-scoped): open the palette and
// New server. Uses the shared resolveAction so macOS ⌘K/⌘N and Windows
// Ctrl+Shift+K/N stay in one place.
export function useAppKeymap(onNewServer: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const action = resolveAction(e)
      if (action === 'palette') {
        e.preventDefault()
        usePalette.getState().toggle()
      } else if (action === 'new-server' && !usePalette.getState().open) {
        e.preventDefault()
        onNewServer()
      } else if (action === 'settings') {
        e.preventDefault()
        useSettings.getState().show()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onNewServer])
}
