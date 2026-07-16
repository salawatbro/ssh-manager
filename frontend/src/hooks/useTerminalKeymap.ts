import { useEffect } from 'react'
import { useSessions } from '../stores/sessions'
import { usePalette } from '../stores/palette'
import { resolveAction } from '../lib/keymap'

// Terminal-scoped keymap (split / close pane / switch tab). Platform-aware via
// resolveAction. These never reach the pty — each Terminal's custom key handler
// drops the platform's app-combos (see Terminal.tsx). Palette / new-server live
// in useAppKeymap; find (⌘F) is handled inside the focused Terminal.
export function useTerminalKeymap() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const action = resolveAction(e)
      if (action === null) return
      if (usePalette.getState().open) return
      const st = useSessions.getState()
      const active = st.tabs.find((t) => t.id === st.activeTabId)
      if (!active) return
      if (action === 'split-v') {
        e.preventDefault()
        st.splitFocused('v')
      } else if (action === 'split-h') {
        e.preventDefault()
        st.splitFocused('h')
      } else if (action === 'close-pane') {
        e.preventDefault()
        st.closePane(active.id, active.focusedPaneId)
      } else if (action === 'next-tab') {
        e.preventDefault()
        st.nextTab()
      } else if (action === 'prev-tab') {
        e.preventDefault()
        st.prevTab()
      } else if (typeof action === 'object') {
        const t = st.tabs[action.tab - 1]
        if (t) {
          e.preventDefault()
          st.selectTab(t.id)
        }
      }
      // 'palette' / 'new-server' are handled by useAppKeymap — ignore here.
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
