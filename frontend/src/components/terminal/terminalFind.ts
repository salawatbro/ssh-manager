import type { SearchAddon } from '@xterm/addon-search'
import type { FindResults } from '../../lib/findStatus'
import { findDecorations } from '../../lib/termTheme'

// Runs a query against the terminal buffer. An empty query clears rather
// than searching (fires as the user backspaces the input to nothing).
// Decorations are what make the addon's onDidChangeResults event fire at
// all, so the match counter and the highlighting are one feature, not two.
export function runFind(
  search: SearchAddon | null,
  query: string,
  dir: 'next' | 'prev',
  setFindResults: (r: FindResults | null) => void,
) {
  if (!search) return
  if (!query) {
    search.clearDecorations()
    setFindResults(null)
    return
  }
  const opts = { decorations: findDecorations() }
  if (dir === 'next') search.findNext(query, opts)
  else search.findPrevious(query, opts)
}

// The single path that hides the find bar — used by both the toggle key
// handler and FindBar's own close button — so there is no way to hide the
// bar without also clearing decorations and the stored results. Leaving
// decorations painted with no bar on screen also leaves the addon's
// debounced re-search armed: its onWriteParsed/onResize hooks re-run a
// full-buffer search on a 200ms timer for as long as a cached search term
// and decorations are set, which never used to happen before this task (the
// addon only arms that loop once decorations have been used at least once).
export function closeFind(
  search: SearchAddon | null,
  setFindResults: (r: FindResults | null) => void,
  setFindOpen: (open: boolean) => void,
) {
  search?.clearDecorations()
  setFindResults(null)
  setFindOpen(false)
}
