import { Pin } from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { openServer } from '../../lib/launch'
import { shortRecency } from '../../lib/relativeTime'
import type { TunnelSummary } from '../../lib/serverList'
import type { RowDrag } from '../../hooks/useServerDrag'
import { useSettings } from '../../stores/settings'
import { EnvChip } from '../ui/EnvChip'
import { IconTile } from '../ui/IconTile'
import { AuthIcon } from './AuthIcon'

interface Props {
  server: Server
  via: string | null
  tunnels: TunnelSummary
  selected: boolean
  onSelect: () => void
  onContextMenu: (x: number, y: number) => void
  drag: RowDrag
}

// One server row: click selects (the inspector shows it), double-click or
// Enter connects.
export function ServerRow({ server, via, tunnels, selected, onSelect, onContextMenu, drag }: Props) {
  const target = `${server.user}@${server.host}${server.port === 22 ? '' : `:${server.port}`}`
  const dot =
    tunnels.failed ? { tone: 'bad' as const, label: 'A tunnel failed' } : tunnels.up > 0 ? { tone: 'ok' as const, label: 'Tunnel running' } : undefined
  const tunColor = tunnels.failed ? 'text-bad-tx' : tunnels.up > 0 ? 'text-ok-tx' : 'text-tx3'
  // Compact puts the address beside the name: about twice the rows fit.
  const compact = useSettings((s) => s.settings?.density === 'compact')

  return (
    <div
      className="relative"
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
    >
      {drag.indicator && (
        <span
          className={`pointer-events-none absolute inset-x-[10px] z-10 h-[2px] rounded-[1px] bg-acc ${
            drag.indicator === 'top' ? 'top-0' : 'bottom-0'
          }`}
        />
      )}
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        onDoubleClick={() => openServer(server.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            openServer(server.id)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e.clientX, e.clientY)
        }}
        className={`flex w-full items-center gap-[12px] rounded-[10px] px-[12px] text-left ${compact ? 'h-[34px]' : 'h-[54px]'} ${
          selected ? 'bg-s3' : 'hover:bg-s2'
        }`}
      >
        <IconTile name={server.name} icon={server.icon} color={server.color} group={server.group} size={compact ? 22 : 34} dot={dot} />
        <span className={`flex min-w-0 flex-1 ${compact ? 'items-baseline gap-[10px]' : 'flex-col gap-[3px]'}`}>
          <span className={`flex items-center gap-[7px] ${compact ? 'max-w-[55%] shrink-0' : 'min-w-0'}`}>
            <span className="truncate text-[13.5px] font-medium text-tx">{server.name}</span>
            <EnvChip env={server.environment} />
            {server.pinned && <Pin size={11} className="shrink-0 text-tx3" fill="currentColor" aria-label="Pinned to the menu bar" />}
          </span>
          <span className="truncate font-mono text-[11.5px] text-tx3">
            {target}
            {via ? `  ·  via ${via}` : ''}
          </span>
        </span>
        <AuthIcon server={server} />
        <span className="flex w-[44px] shrink-0 justify-end">
          {tunnels.total > 0 && (
            <span className={`flex h-[20px] items-center rounded-[5px] bg-s2 px-[6px] font-mono text-[10.5px] ${tunColor}`}>
              ⇄ {tunnels.up}/{tunnels.total}
            </span>
          )}
        </span>
        <span className="w-[34px] shrink-0 text-right text-[11.5px] text-tx3">{shortRecency(server.lastUsedAt)}</span>
      </button>
    </div>
  )
}
