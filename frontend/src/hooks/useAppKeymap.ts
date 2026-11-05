import { useEffect } from 'react'
import { resolveAction } from '../lib/keymap'
import { usePalette } from '../stores/palette'
import { useSettings } from '../stores/settings'
import { useLock } from '../stores/lock'

// App-level hotkeys: palette, New server, Settings and Lock. Uses the shared
// resolveAction so macOS ⌘K/⌘N and Windows Ctrl+Shift+K/N stay in one place.
export function useAppKeymap(onNewServer: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (useLock.getState().locked) return
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
      } else if (action === 'lock') {
        e.preventDefault()
        // ⌘L locks when a PIN is set; otherwise send the user to set one.
        if (useLock.getState().hasPin) useLock.getState().lock()
        else useSettings.getState().show()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onNewServer])
}
