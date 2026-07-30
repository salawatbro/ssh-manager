import { useEffect } from 'react'
import { useSessions } from '../stores/sessions'
import { usePalette } from '../stores/palette'
import { useSnippets } from '../stores/snippets'
import { useGuard } from '../stores/guard'
import { useSftp } from '../stores/sftp'
import { resolveAction } from '../lib/keymap'

// Terminal-scoped keymap (split / close pane / switch tab / snippet
// quick-slot). Platform-aware via resolveAction. These never reach the pty —
// each Terminal's custom key handler drops the platform's app-combos (see
// Terminal.tsx). Palette / new-server / snippets (open) live in useAppKeymap;
// find (⌘F) is handled inside the focused Terminal.
export function useTerminalKeymap() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const action = resolveAction(e)
      if (action === null) return
      // All three overlays own the keyboard while open — mirrors the command
      // palette's existing gate; the snippet palette gets the same one so a
      // ⌘⇧<digit> typed while browsing/filtering it doesn't ALSO fire a
      // quick-slot run underneath. The guard modal is included too: while a
      // confirmation is up, split/close/tab-switch/quick-slot must not fire
      // underneath it.
      if (usePalette.getState().open || useSnippets.getState().open || useGuard.getState().open) return
      const st = useSessions.getState()
      const active = st.tabs.find((t) => t.id === st.activeTabId)
      if (!active) return
      // The terminal area stays mounted behind a frontmost SFTP tab, so this
      // handler is live there too. Tab switching is fine (selectTab/next/prev
      // hand focus back), but anything that MUTATES a pane the user cannot see
      // — split, close, snippet quick-run — must not fire.
      const switchesTab = action === 'next-tab' || action === 'prev-tab' || (typeof action === 'object' && 'tab' in action)
      if (useSftp.getState().active && !switchesTab) return
      if (action === 'split-v') {
        e.preventDefault()
        st.splitFocused('v')
      } else if (action === 'split-h') {
        e.preventDefault()
        st.splitFocused('h')
      } else if (action === 'close-pane') {
        e.preventDefault()
        // ⌘W on a single-pane tab closes the whole session, so it goes through
        // the same confirm the × button does; on a split it just drops one pane
        // (not the session), so no prompt.
        if (active.root.kind === 'leaf') st.requestCloseTab(active.id)
        else st.closePane(active.id, active.focusedPaneId)
      } else if (action === 'next-tab') {
        e.preventDefault()
        st.nextTab()
      } else if (action === 'prev-tab') {
        e.preventDefault()
        st.prevTab()
      } else if (typeof action === 'object' && 'tab' in action) {
        const t = st.tabs[action.tab - 1]
        if (t) {
          e.preventDefault()
          st.selectTab(t.id)
        }
      } else if (typeof action === 'object' && 'snippetSlot' in action) {
        e.preventDefault()
        void useSnippets.getState().runSlot(action.snippetSlot)
      }
      // 'palette' / 'new-server' / 'snippets' (open) are handled by
      // useAppKeymap — ignore here.
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
