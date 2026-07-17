import { ArrowLeftRight } from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { envClassOf } from '../../lib/env'
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

  return (
    // The tunnels trigger below is a second interactive control on the row —
    // a <button> can't nest another <button>, so the row itself is now a
    // plain div wrapping two sibling buttons instead of being the button.
    <div className={`group relative ${selected ? 'bg-bgSel' : 'hover:bg-bg1b'}`}>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => {
          // Double-click opens a terminal. Close any edit form first (select
          // null) so the new session's tab is what fills the content area.
          useServers.getState().select(null)
          useSessions.getState().open(server)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e.clientX, e.clientY)
        }}
        // UI-01: 38px row — two lines, name over user@host:port. pr leaves
        // room for the tunnels trigger without it overlapping the truncated
        // target line.
        className="flex h-[38px] w-full items-center gap-[9px] pl-[12px] pr-[32px] text-left"
      >
        {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
        {/* group and environment are independent fields (a "Prod" group can
            legitimately hold a dev box), so the environment marker lives here,
            per row, rather than once on the group header. Kept as a tight pair
            with the status ring since both read as "identity of this server". */}
        <span className="flex shrink-0 items-center gap-[4px]">
          {/* UI-11: status is a circle. v0.2 still has no live sessions, so
              every row is idle — StatusDot renders "disc" as an unfilled
              ring; the component itself is what v0.3's live status will
              drive. */}
          <StatusDot status="disc" />
          {/* UI-11: environment is a square — rounded-env, the 2px token, never
              rounded-sm (Tailwind's 4px default) — so the two axes never share
              a shape and a colour-blind user can still tell prod from
              "connected". */}
          <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(server.environment)}`} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="truncate text-text">{server.name}</span>
          <span className="truncate font-mono text-[11px] text-textDim">{target}</span>
        </span>
      </button>
      <button
        type="button"
        title="Tunnels"
        onClick={(e) => {
          e.stopPropagation()
          onTunnels()
        }}
        className="absolute right-[8px] top-1/2 flex h-[20px] w-[20px] -translate-y-1/2 items-center justify-center rounded-[4px] text-textDim opacity-0 hover:bg-bg2 hover:text-text group-hover:opacity-100"
      >
        <ArrowLeftRight size={13} />
      </button>
    </div>
  )
}
