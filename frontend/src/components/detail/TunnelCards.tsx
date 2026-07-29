import { useEffect, useState } from 'react'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useForwards, type ForwardStatus } from '../../stores/forwards'
import { forwardDotStatus } from '../../lib/forwardStatus'
import { StatusDot } from '../server/StatusDot'
import { AddForwardModal } from './AddForwardModal'

const TYPE_LABEL: Record<string, string> = {
  [ForwardType.ForwardLocal]: '-L',
  [ForwardType.ForwardRemote]: '-R',
  [ForwardType.ForwardDynamic]: '-D',
}

// A dynamic forward negotiates its destination per connection, so it has no
// fixed far side to print — the design writes that as "→ SOCKS".
function route(f: PortForward): string {
  if (f.type === ForwardType.ForwardDynamic) return `${f.bindAddr}:${f.bindPort} → SOCKS`
  return `${f.bindAddr}:${f.bindPort} → ${f.destHost}:${f.destPort}`
}

// The meta line under the route. The design shows traffic counters there
// ("412 KB"); nothing measures those, so this carries what the backend really
// reports: the forward's name, and the live detail from the forward:status
// stream (a bind error, or plainly stopped).
function meta(f: PortForward, status: ForwardStatus | undefined): string {
  const state = status?.state === 'running' ? 'running' : status?.detail || 'stopped'
  return `${f.name} · ${state}`
}

interface Props {
  serverId: string
}

// The tunnels section of the detail page (dizayn manbasi: Zish.dc.html detail
// view) — the same data TunnelsPanel used to show in the 392px right-hand
// panel, now cards in the page that owns the server.
export function TunnelCards({ serverId }: Props) {
  const forwards = useForwards((s) => s.byServer[serverId])
  const statusById = useForwards((s) => s.statusById)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PortForward | null>(null)

  useEffect(() => {
    void useForwards.getState().load(serverId)
  }, [serverId])

  const list = forwards ?? []
  const running = list.filter((f) => statusById[f.id]?.state === 'running').length

  return (
    <div>
      <div className="flex items-center gap-[8px]">
        <span className="text-[13px] font-semibold text-text">Tunnels</span>
        <span className="rounded-[3px] bg-bg2 px-[5px] py-[1px] font-mono text-[10.5px] text-textDim">
          {running} of {list.length} running
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-[26px] rounded-[5px] border border-border px-[10px] text-[11.5px] text-textMuted hover:border-borderStrong hover:text-text"
        >
          + Add forward
        </button>
      </div>

      <div className="mt-[10px] flex flex-col gap-[8px]">
        {list.length === 0 && (
          <div className="rounded-[7px] border border-border bg-bg1 px-[12px] py-[10px] text-[12px] text-textDim">
            No tunnels for this host yet.
          </div>
        )}
        {list.map((f) => {
          const status = statusById[f.id]
          const isRunning = status?.state === 'running'
          return (
            <div key={f.id} className="rounded-[7px] border border-border bg-bg1 px-[12px] py-[10px]">
              <div className="flex items-center gap-[9px]">
                <span className="shrink-0 rounded-[3px] bg-bg2 px-[5px] py-[1px] font-mono text-[10.5px] text-accentFg">
                  {TYPE_LABEL[f.type] ?? '-L'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(f)}
                  className="min-w-0 flex-1 truncate text-left font-mono text-[12.5px] text-text hover:text-accentFg"
                >
                  {route(f)}
                </button>
                <StatusDot status={forwardDotStatus(status?.state)} size={6} />
                <button
                  type="button"
                  onClick={() =>
                    void (isRunning
                      ? useForwards.getState().stop(f.id)
                      : useForwards.getState().start(f.id))
                  }
                  className={`h-[22px] shrink-0 rounded-[5px] px-[9px] text-[11px] ${
                    isRunning
                      ? 'border border-borderStrong text-textMuted hover:text-text'
                      : 'bg-accentDim text-accentFg'
                  }`}
                >
                  {isRunning ? 'Stop' : 'Start'}
                </button>
              </div>
              <div className="mt-[5px] truncate font-mono text-[10.5px] text-textDim">{meta(f, status)}</div>
            </div>
          )
        })}
      </div>

      {(adding || editing) && (
        <AddForwardModal
          serverId={serverId}
          initial={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
