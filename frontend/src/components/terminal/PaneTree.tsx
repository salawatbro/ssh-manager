import type { PaneNode } from '../../stores/sessions'
import { useSessions } from '../../stores/sessions'
import { useSettings } from '../../stores/settings'
import { Terminal } from './Terminal'
import { BlockTerminalPane } from './block/BlockTerminalPane'
import { PaneSplit } from './PaneSplit'

// PaneTree renders a pane node: a leaf is one Terminal (or, when block mode
// is on, one BlockTerminalPane); a split defers to PaneSplit (which recurses
// back here for each child).
export function PaneTree({ node, tabId, focusedPaneId }: { node: PaneNode; tabId: string; focusedPaneId: string }) {
  const focusPane = useSessions((s) => s.focusPane)
  // Deterministic, no-double-open branch: block mode only takes over when
  // shell integration is also on, since a block session with no OSC 133
  // feed can't chunk output into commands at all. Classic mode or
  // integration off always falls back to the plain xterm Terminal.
  const blocks = useSettings((s) => s.settings?.terminalMode === 'blocks' && !!s.settings?.shellIntegration)
  if (node.kind === 'leaf') {
    const props = {
      paneId: node.id,
      tabId,
      serverId: node.serverId,
      focused: focusedPaneId === node.id,
      onFocus: () => focusPane(tabId, node.id),
    }
    return blocks ? <BlockTerminalPane {...props} /> : <Terminal {...props} />
  }
  return <PaneSplit node={node} tabId={tabId} focusedPaneId={focusedPaneId} />
}
