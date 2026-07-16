import { useSessions } from '../../stores/sessions'
import { useTerminalKeymap } from '../../hooks/useTerminalKeymap'
import { TabBar } from './TabBar'
import { TerminalTab } from './TerminalTab'

// The content-area terminal view. Inactive tabs stay MOUNTED but hidden so
// their sessions and scrollback survive a tab switch (unmounting would call
// SSHService.Close). When no tabs are open it is just the idle bg0 surface.
export function TerminalArea() {
  useTerminalKeymap()
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)

  if (tabs.length === 0) return <div className="min-w-0 flex-1 bg-bg0" />
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-bg0">
      <TabBar />
      <div className="min-h-0 flex-1">
        {tabs.map((t) => (
          <div key={t.id} className={t.id === active.id ? 'h-full' : 'hidden'}>
            <TerminalTab tab={t} />
          </div>
        ))}
      </div>
    </div>
  )
}
