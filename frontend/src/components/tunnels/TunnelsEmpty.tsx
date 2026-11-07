import { Database, Monitor, Plus } from 'lucide-react'
import { presetById, type TunnelPreset } from '../../lib/tunnelPresets'
import { Button } from '../ui/Button'

const STARTERS = ['postgres', 'redis', 'web'].map((id) => presetById(id)).filter((p): p is TunnelPreset => !!p)

// Tunnels before the first one: what a tunnel is for, and three common starts.
export function TunnelsEmpty({ onNew }: { onNew: (preset?: TunnelPreset) => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-[24px]">
      <div className="flex max-w-[380px] flex-col items-center gap-[12px] text-center">
        <div aria-hidden="true" className="mb-[4px] flex items-center">
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px] bg-s3 text-tx2">
            <Monitor size={18} strokeWidth={1.8} />
          </span>
          <span className="h-0 w-[64px] border-t-2 border-dashed border-acc" />
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[11px] bg-acc-soft text-acc-tx">
            <Database size={18} strokeWidth={1.8} />
          </span>
        </div>
        <h2 className="m-0 text-[15px] font-semibold text-tx">No tunnels yet</h2>
        <p className="m-0 text-[12.5px] leading-[1.5] text-tx2">Reach a database or a web panel on a server as if it ran on your Mac.</p>
        <Button variant="primary" className="mt-[4px]" onClick={() => onNew()}>
          <Plus size={13} strokeWidth={2.4} />
          New tunnel
        </Button>
        <div className="mt-[2px] flex flex-wrap items-center justify-center gap-[6px]">
          <span className="text-[11.5px] text-tx3">Start from</span>
          {STARTERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onNew(p)}
              className="h-[24px] rounded-[12px] border border-line2 px-[9px] text-[11.5px] text-tx2 hover:bg-s2 hover:text-tx"
            >
              {p.label} <span className="font-mono opacity-75">{p.port}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
