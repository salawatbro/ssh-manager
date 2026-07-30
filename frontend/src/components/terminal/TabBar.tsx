import { useSessions } from '../../stores/sessions'
import { usePanes } from '../../stores/panes'
import { useServers } from '../../stores/servers'
import { usePalette } from '../../stores/palette'
import { useSftp } from '../../stores/sftp'
import { tabStatus } from '../../lib/tabStatus'
import { StatusDot } from '../server/StatusDot'

// The session tab strip, inside App.tsx's 52px title bar (dizayn manbasi:
// Zish.dc.html title bar + tabs). The redesign turns the strip's full-height
// cells into 34px pills laid out with gaps: a terminal tab carries its live
// status dot, the SFTP session carries an "SFTP" badge instead, and the
// trailing "+" opens the command palette so the user can pick a server for a
// new tab (there is no bare "new tab" — a tab is always tied to a server).
//
// The 2px environment top-border the old cells wore is gone with them: a pill
// has no top edge to paint, and the design does not carry the env axis up here.
// It still shows on the server detail page.
const PILL = 'no-drag group flex h-[34px] shrink-0 cursor-default items-center gap-[7px] rounded-[6px] border px-[9px]'
const IDLE = 'border-transparent text-textMuted hover:bg-bgSel'

export function TabBar() {
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const selectTab = useSessions((s) => s.selectTab)
  const requestCloseTab = useSessions((s) => s.requestCloseTab)
  const paneStatus = usePanes((s) => s.paneStatus)
  const servers = useServers((s) => s.servers)
  // One SFTP session at a time (the store holds a single one), so at most one
  // SFTP tab — shown last, after the terminal tabs.
  const sftpOpen = useSftp((s) => s.open)
  const sftpActive = useSftp((s) => s.active)
  const sftpServerId = useSftp((s) => s.serverId)
  const sftpServer = servers.find((s) => s.id === sftpServerId)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-[6px] overflow-hidden px-[8px]">
      {tabs.map((t) => {
        // While the SFTP tab is frontmost no terminal tab is, even though the
        // sessions store still remembers which one to return to.
        const active = t.id === activeTabId && !sftpActive
        return (
          <div
            key={t.id}
            title={t.hostLabel}
            onMouseDown={() => selectTab(t.id)}
            style={{ minWidth: 150, maxWidth: 200 }}
            className={`${PILL} ${active ? 'border-border bg-bg0 text-text' : IDLE}`}
          >
            <StatusDot status={tabStatus(t, paneStatus)} size={7} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.stopPropagation()
                requestCloseTab(t.id)
              }}
              className={`shrink-0 text-[13px] leading-none text-textDim hover:text-text ${
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              ×
            </button>
          </div>
        )
      })}
      {sftpOpen && (
        <div
          title={`SFTP — ${sftpServer?.name ?? sftpServer?.host ?? ''}`}
          onMouseDown={() => useSftp.getState().focus()}
          style={{ minWidth: 150, maxWidth: 200 }}
          className={`${PILL} ${sftpActive ? 'border-accentDim bg-accentDim/40 text-text' : IDLE}`}
        >
          {/* A file browser has no connection status of its own to show, so the
              slot the terminal tabs give their dot carries the mode instead. */}
          <span className="shrink-0 rounded-[3px] bg-accentDim px-[4px] py-[1px] text-[9.5px] font-semibold tracking-[.06em] text-accentFg">
            SFTP
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px]">
            {sftpServer?.name ?? sftpServer?.host ?? 'SFTP'}
          </span>
          <button
            type="button"
            title="Close SFTP"
            onMouseDown={(e) => {
              e.stopPropagation()
              useSftp.getState().close()
            }}
            className={`shrink-0 text-[13px] leading-none text-textDim hover:text-text ${
              sftpActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            ×
          </button>
        </div>
      )}
      <button
        type="button"
        title="New session (⌘K)"
        onClick={() => usePalette.getState().show()}
        className="no-drag flex h-[26px] w-[34px] shrink-0 items-center justify-center rounded-[5px] text-[15px] leading-none text-textDim hover:bg-bgSel hover:text-text"
      >
        +
      </button>
    </div>
  )
}
