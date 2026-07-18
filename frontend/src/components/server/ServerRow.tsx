import { ArrowLeftRight, Pin, Terminal } from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { StatusDot } from './StatusDot'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'

interface Props {
  server: Server
  selected: boolean
  onSelect: () => void
  onContextMenu: (x: number, y: number) => void
  // Opens TunnelsPanel for this server (App.tsx's `tunnelsFor`) — the
  // design's tunnels-panel trigger is ambiguous (its own row icon reads as
  // an auth-method/key indicator, not an action), so this is a deliberate,
  // unambiguous per-row affordance rather than a reused design glyph.
  onTunnels: () => void
}

export function ServerRow({ server, selected, onSelect, onContextMenu, onTunnels }: Props) {
  const target = `${server.user}@${server.host}${server.port === 22 ? '' : `:${server.port}`}`

  // Shared by the connect icon and the row's double-click: close any open
  // edit form first (select null) so the new session's tab is what fills
  // the content area.
  function connect() {
    useServers.getState().select(null)
    useSessions.getState().open(server)
  }

  return (
    // The connect/tunnels triggers below are further interactive controls on
    // the row — a <button> can't nest another <button>, so the row itself is
    // a plain div wrapping sibling buttons instead of being the button.
    <div className={`group relative ${selected ? 'bg-bgSel' : 'hover:bg-bg1b'}`}>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={connect}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e.clientX, e.clientY)
        }}
        // UI-01: 38px row — two lines, name over user@host:port. pr leaves
        // room for the connect + tunnels trigger cluster without it
        // overlapping the truncated target line.
        className="flex h-[38px] w-full items-center gap-[9px] pl-[12px] pr-[54px] text-left"
      >
        {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
        {/* UI-11: status is a circle. v0.2 still has no live sessions, so
            every row is idle — StatusDot renders "disc" as an unfilled
            ring; the component itself is what v0.3's live status will
            drive. The environment square lives once per group, on
            GroupHeader (dizayn manbasi: MainWindow.dc.html sidebar rows
            carry only the status circle), not here — so the two shapes
            never collide on a single row either. */}
        <StatusDot status="disc" />
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="flex items-center gap-[5px]">
            <span className="truncate text-text">{server.name}</span>
            {server.pinned && (
              <Pin size={10} className="shrink-0 text-textDim" fill="currentColor" />
            )}
          </span>
          <span className="truncate font-mono text-[11px] text-textDim">{target}</span>
        </span>
      </button>
      {/* Icon cluster: connect (dizayn manbasi's row-trailing glyph, wired to
          the same open-session action as the double-click) plus the
          tunnels trigger from task 1. Grouped under one opacity toggle so
          keyboard focus on either button reveals both — distinguishable
          glyphs, non-overlapping hit targets. */}
      <div className="absolute right-[8px] top-1/2 flex -translate-y-1/2 items-center gap-[2px] opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          title="Connect"
          onClick={(e) => {
            e.stopPropagation()
            connect()
          }}
          className="flex h-[20px] w-[20px] items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text"
        >
          <Terminal size={13} />
        </button>
        <button
          type="button"
          title="Tunnels"
          onClick={(e) => {
            e.stopPropagation()
            onTunnels()
          }}
          className="flex h-[20px] w-[20px] items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text"
        >
          <ArrowLeftRight size={13} />
        </button>
      </div>
    </div>
  )
}
