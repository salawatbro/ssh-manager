import { Fragment } from 'react'
import { ArrowRight, Laptop, Server as ServerIcon } from 'lucide-react'
import type { RouteNode } from '../../lib/route'

// This Mac → each jump host → the server, left to right; the target is tinted.
export function RouteLane({ nodes }: { nodes: RouteNode[] }) {
  return (
    <section aria-label="Route" className="flex flex-col gap-[8px]">
      <h3 className="m-0 text-[12px] font-semibold text-tx2">Route</h3>
      <div className="flex items-stretch">
        {nodes.map((n, i) => (
          <Fragment key={n.key}>
            <div
              className={`flex min-w-0 flex-1 flex-col gap-[4px] rounded-[9px] border px-[9px] py-[8px] ${
                n.target ? 'border-transparent bg-acc-soft text-acc-tx' : 'border-line bg-s2 text-tx'
              }`}
              title={`${n.name} — ${n.sub}`}
            >
              <span className="flex min-w-0 items-center gap-[6px]">
                {n.kind === 'mac' ? <Laptop size={13} strokeWidth={1.8} className="shrink-0" /> : <ServerIcon size={13} strokeWidth={1.8} className="shrink-0" />}
                <span className="truncate text-[12px] font-semibold">{n.name}</span>
              </span>
              <span className="truncate text-[10.5px] text-tx3">{n.sub}</span>
            </div>
            {i < nodes.length - 1 && (
              <span aria-hidden="true" className="flex w-[18px] shrink-0 items-center justify-center text-tx3">
                <ArrowRight size={12} strokeWidth={2} />
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </section>
  )
}
