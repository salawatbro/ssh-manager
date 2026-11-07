import { useState } from 'react'
import { MoreHorizontal, RotateCcw } from 'lucide-react'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { MenuAlign } from '../../lib/menuPosition'
import { rowState, TYPE_FLAG, tunnelRoute, wanted, type RowState } from '../../lib/tunnels'
import { useForwards, type ForwardStatus } from '../../stores/forwards'
import { toastError } from '../../stores/toasts'
import { IconTile, type DotTone } from '../ui/IconTile'
import { Switch } from '../ui/Switch'
import { FailedNotice } from './FailedNotice'
import { TrafficCell } from './TrafficCell'
import { TunnelMenu } from './TunnelMenu'

const DOT: Record<RowState, { tone: DotTone; label: string }> = {
  running: { tone: 'ok', label: 'Running' },
  failed: { tone: 'bad', label: 'Failed' },
  retrying: { tone: 'warn', label: 'Reconnecting' },
  stopped: { tone: 'idle', label: 'Stopped' },
}

interface Props {
  forward: PortForward
  serverLine: string
  status: ForwardStatus | undefined
  buckets: number[] | undefined
  first: boolean
  onEdit: () => void
  onStyle: () => void
}

async function run(action: Promise<string | null>) {
  const err = await action
  if (err) toastError(err)
}

export function TunnelTableRow({ forward: f, serverLine, status, buckets, first, onEdit, onStyle }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; align: MenuAlign } | null>(null)
  const state = rowState(status?.state)
  const on = wanted(state)
  const fw = useForwards.getState

  return (
    <div
      role="row"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, align: 'start' })
      }}
      className={`flex flex-col ${first ? '' : 'border-t border-line'} ${state === 'failed' ? 'bg-bad-soft' : ''}`}
    >
      <div className="flex h-[54px] items-center gap-[14px] px-[14px]">
        <span role="cell" className="flex w-[30px] shrink-0">
          <Switch
            checked={on}
            label={`${on ? 'Stop' : 'Start'} ${f.name}`}
            onChange={() => void run(on ? fw().stop(f.id) : fw().start(f.id))}
          />
        </span>
        <span role="cell" className="flex w-[200px] min-w-0 shrink-0 items-center gap-[10px]">
          <button type="button" title="Icon and colour…" aria-label={`Icon and colour for ${f.name}`} onClick={onStyle} className="rounded-[9px]">
            <IconTile name={f.name} icon={f.icon} color={f.color} size={32} dot={DOT[state]} halo="s1" />
          </button>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <button type="button" onClick={onEdit} title="Edit tunnel" className="truncate text-left text-[13px] font-medium text-tx hover:text-acc-tx">
              {f.name}
            </button>
            <span className="truncate text-[11.5px] text-tx3">{serverLine}</span>
          </span>
        </span>
        <span role="cell" className="flex min-w-0 flex-1 items-center gap-[8px]">
          <span className="shrink-0 rounded-[4px] bg-s3 px-[5px] py-[1px] font-mono text-[10.5px] text-acc-tx">{TYPE_FLAG[f.type] ?? '-L'}</span>
          <span className="truncate font-mono text-[12px] text-tx">{tunnelRoute(f)}</span>
        </span>
        <TrafficCell state={state} buckets={buckets} detail={status?.detail ?? ''} />
        <span role="cell" className="flex w-[92px] shrink-0 items-center gap-[5px]">
          {f.autoStart && (
            <span title="Starts with Zish" className="rounded-[4px] bg-s3 px-[6px] py-[1px] text-[10.5px] text-tx2">
              auto
            </span>
          )}
          {f.reconnect && (
            <span title="Reconnects after sleep or a network change" className="flex rounded-[4px] bg-s3 px-[5px] py-[2px] text-tx2">
              <RotateCcw size={11} strokeWidth={2.2} role="img" aria-label="Reconnects" />
            </span>
          )}
        </span>
        <span role="cell" className="flex w-[56px] shrink-0 justify-end">
          <button
            type="button"
            aria-label={`More for ${f.name}`}
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.right, y: r.bottom + 4, align: 'end' })
            }}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-tx3 hover:bg-s2 hover:text-tx"
          >
            <MoreHorizontal size={14} strokeWidth={2.2} />
          </button>
        </span>
      </div>
      {state === 'failed' && (
        <FailedNotice
          port={f.bindPort}
          portBusy={status?.portBusy ?? false}
          detail={status?.detail ?? ''}
          onUsePort={(port) => void run(fw().usePort(f.id, port))}
          onRetry={() => void run(fw().start(f.id))}
        />
      )}
      {menu && (
        <TunnelMenu
          forward={f}
          running={state === 'running'}
          x={menu.x}
          y={menu.y}
          align={menu.align}
          onClose={() => setMenu(null)}
          onEdit={onEdit}
          onStyle={onStyle}
        />
      )}
    </div>
  )
}
