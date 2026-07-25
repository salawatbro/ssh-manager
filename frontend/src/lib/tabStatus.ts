import type { Tab } from '../stores/sessions'
import type { TermStatus } from '../hooks/useTerminalSession'
import type { Status } from './status'
import { collectLeaves } from './paneTree'

const termToStatus: Record<TermStatus, Status> = {
  connecting: 'connecting',
  connected: 'connected',
  error: 'failed',
  closed: 'disc',
  // Transient: Terminal closes the pane on the same render pass this status
  // lands, so the tab strip rarely shows it — 'disc' is the closest steady
  // state if it's ever observed mid-teardown.
  exited: 'disc',
}

// tabStatus collapses a tab's pane statuses into the single dot the tab strip
// shows (MainWindow.dc.html). A failed/connecting pane always dominates a
// healthy sibling. A pane with no entry yet (not mounted/reported) reads as
// connecting, matching useTerminalSession's initial state.
export function tabStatus(tab: Tab, paneStatus: Record<string, TermStatus>): Status {
  const statuses = collectLeaves(tab.root).map((leaf) => termToStatus[paneStatus[leaf.id] ?? 'connecting'])
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('connecting')) return 'connecting'
  if (statuses.includes('disc')) return 'disc'
  return 'connected'
}
