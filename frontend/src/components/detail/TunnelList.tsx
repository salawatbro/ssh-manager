import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useForwards } from '../../stores/forwards'
import { toastError } from '../../stores/toasts'
import { IconTile } from '../ui/IconTile'
import { Switch } from '../ui/Switch'
import { LookPicker } from '../look/LookPicker'
import { AddForwardModal } from './AddForwardModal'

const TYPE_FLAG: Record<string, string> = {
  [ForwardType.ForwardLocal]: 'L',
  [ForwardType.ForwardRemote]: 'R',
  [ForwardType.ForwardDynamic]: 'D',
}

function route(f: PortForward): string {
  const flag = TYPE_FLAG[f.type] ?? 'L'
  if (f.type === ForwardType.ForwardDynamic) return `${flag} ${f.bindAddr}:${f.bindPort} → SOCKS`
  return `${flag} ${f.bindAddr}:${f.bindPort} → ${f.destHost}:${f.destPort}`
}

async function toggle(f: PortForward, running: boolean) {
  const st = useForwards.getState()
  const err = running ? await st.stop(f.id) : await st.start(f.id)
  if (err) toastError(err)
}

export function TunnelList({ serverId }: { serverId: string }) {
  const forwards = useForwards((s) => s.byServer[serverId])
  const statusById = useForwards((s) => s.statusById)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PortForward | null>(null)
  const [styling, setStyling] = useState<PortForward | null>(null)
  const list = forwards ?? []

  return (
    <section aria-label="Tunnels" className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[7px]">
        <h3 className="m-0 flex-1 text-[12px] font-semibold text-tx2">Tunnels</h3>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-[24px] items-center gap-[4px] rounded-[6px] px-[8px] text-[11.5px] text-tx2 hover:bg-s2 hover:text-tx"
        >
          <Plus size={12} strokeWidth={2} />
          Add
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line2 px-[12px] py-[11px] text-[12px] leading-[1.5] text-tx3">
          No tunnels. Forward a port with -L, -R or -D and Zish keeps it alive.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line">
          {list.map((f) => {
            const status = statusById[f.id]
            const running = status?.state === 'running'
            const failed = status?.state === 'error'
            return (
              <div key={f.id} className="flex items-center gap-[10px] border-t border-line px-[11px] py-[9px] first:border-t-0">
                <button type="button" aria-label={`Icon and colour for ${f.name}`} onClick={() => setStyling(f)} className="rounded-[6px]">
                  <IconTile name={f.name} icon={f.icon} color={f.color} size={22} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <button
                    type="button"
                    onClick={() => setEditing(f)}
                    title="Edit tunnel"
                    className="truncate text-left text-[12.5px] font-medium text-tx hover:text-acc-tx"
                  >
                    {f.name}
                  </button>
                  <span className="truncate font-mono text-[11px] text-tx3">{route(f)}</span>
                  {failed && status?.detail && <span className="text-[11px] text-bad-tx">{status.detail}</span>}
                </div>
                <span className={`shrink-0 text-[11px] ${running ? 'text-ok-tx' : failed ? 'text-bad-tx' : 'text-tx3'}`}>
                  {running ? 'on' : failed ? 'failed' : 'off'}
                </span>
                <Switch checked={running} onChange={() => void toggle(f, running)} label={`${running ? 'Stop' : 'Start'} ${f.name}`} />
              </div>
            )
          })}
        </div>
      )}

      {styling && (
        <LookPicker
          name={styling.name}
          group=""
          kindLabel={route(styling)}
          initial={{ icon: styling.icon, color: styling.color }}
          onSave={(look) => useForwards.getState().setLook(styling, look.icon, look.color)}
          onClose={() => setStyling(null)}
        />
      )}

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
    </section>
  )
}
