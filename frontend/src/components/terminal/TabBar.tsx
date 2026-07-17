import { useSessions, tabStatus } from '../../stores/sessions'
import { useServers } from '../../stores/servers'
import { usePalette } from '../../stores/palette'
import { envBorderClassOf } from '../../lib/env'
import { StatusDot } from '../server/StatusDot'

// The session tab strip, merged into App.tsx's 52px title bar (dizayn manbasi:
// MainWindow.dc.html title bar + tabs). Each tab carries its server's
// environment as a 2px top border and a live connection-status dot; the
// trailing "+" opens the command palette so the user can pick a server for a
// new tab (there is no bare "new tab" — a tab is always tied to a server).
export function TabBar() {
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const selectTab = useSessions((s) => s.selectTab)
  const closeTab = useSessions((s) => s.closeTab)
  const paneStatus = useSessions((s) => s.paneStatus)
  const servers = useServers((s) => s.servers)

  return (
    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
      {tabs.map((t) => {
        const active = t.id === activeTabId
        const env = servers.find((s) => s.id === t.serverId)?.environment ?? 'none'
        return (
          <div
            key={t.id}
            title={t.hostLabel}
            onMouseDown={() => selectTab(t.id)}
            className={`no-drag group flex min-w-[150px] max-w-[200px] shrink-0 cursor-default items-center gap-[8px] border-r border-t-2 border-border px-[12px] ${envBorderClassOf(env)} ${
              active ? 'bg-bg0 text-text' : 'bg-bg1b text-textMuted'
            }`}
          >
            <StatusDot status={tabStatus(t, paneStatus)} size={7} />
            <span className="flex-1 truncate">{t.title}</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              className={`flex-none text-[14px] leading-none text-textDim hover:text-text ${
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        title="New session (⌘K)"
        onClick={() => usePalette.getState().show()}
        className="no-drag flex w-[34px] shrink-0 items-center justify-center text-[17px] leading-none text-textDim hover:text-text"
      >
        +
      </button>
    </div>
  )
}
