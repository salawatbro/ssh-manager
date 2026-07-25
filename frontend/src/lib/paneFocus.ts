import type { PaneNode, Tab } from '../stores/sessions'
import { collectLeaves } from './paneTree'

// focusedLeaf walks tabs/activeTabId to the active tab's focused leaf.
// collectLeaves's return type is the broader PaneNode union even though every
// element it returns is actually a leaf (a split node can't be a leaf of
// itself), so the `kind === 'leaf'` check here is a real narrow, not dead
// code — mirrors BroadcastBar's `if (leaf.kind !== 'leaf') continue`. Returns
// null when there is no active tab, or the active tab's focusedPaneId no
// longer matches any leaf.
export function focusedLeaf(tabs: Tab[], activeTabId: string | null): Extract<PaneNode, { kind: 'leaf' }> | null {
  const active = tabs.find((t) => t.id === activeTabId)
  if (!active) return null
  const leaf = collectLeaves(active.root).find((l) => l.id === active.focusedPaneId)
  return leaf && leaf.kind === 'leaf' ? leaf : null
}
