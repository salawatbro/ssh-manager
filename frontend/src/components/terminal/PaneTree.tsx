import type { PaneNode } from '../../stores/sessions'
import { useSessions } from '../../stores/sessions'
import { Terminal } from './Terminal'
import { PaneSplit } from './PaneSplit'

// PaneTree renders a pane node: a leaf is one Terminal; a split defers to
// PaneSplit (which recurses back here for each child).
export function PaneTree({ node, tabId, focusedPaneId }: { node: PaneNode; tabId: string; focusedPaneId: string }) {
  const focusPane = useSessions((s) => s.focusPane)
  if (node.kind === 'leaf') {
    return (
      <Terminal
        paneId={node.id}
        tabId={tabId}
        serverId={node.serverId}
        focused={focusedPaneId === node.id}
        onFocus={() => focusPane(tabId, node.id)}
      />
    )
  }
  return <PaneSplit node={node} tabId={tabId} focusedPaneId={focusedPaneId} />
}
