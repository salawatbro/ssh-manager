import type { Tab } from '../../stores/sessions'
import { PaneTree } from './PaneTree'

export function TerminalTab({ tab }: { tab: Tab }) {
  return <PaneTree node={tab.root} tabId={tab.id} focusedPaneId={tab.focusedPaneId} />
}
