import { routeView, type TunnelDraft } from '../../lib/tunnelDraft'

interface Props {
  draft: TunnelDraft
  serverName: string
  // "via bastion" or "direct".
  via: string
}

const box = 'flex min-w-0 flex-1 flex-col gap-[3px] rounded-[9px] border px-[12px] py-[9px]'

// This Mac → the server → where the traffic ends up, redrawn as the form changes.
export function TunnelRoute({ draft, serverName, via }: Props) {
  const r = routeView(draft, serverName)
  const arrow = (
    <span aria-hidden="true" className="flex w-[44px] shrink-0 items-center justify-center font-mono text-[14px] text-acc-tx">
      {r.arrow}
    </span>
  )
  return (
    <div aria-label="Route" className="flex items-stretch">
      <div className={`${box} border-line bg-s2`}>
        <span className="text-[12px] font-semibold text-tx">This Mac</span>
        <span className="truncate font-mono text-[11px] text-tx2">{r.macSide}</span>
      </div>
      {arrow}
      <div className={`${box} border-line bg-s2`}>
        <span className="truncate text-[12px] font-semibold text-tx">{serverName}</span>
        <span className="truncate font-mono text-[11px] text-tx2">{via}</span>
      </div>
      {arrow}
      <div className={`${box} border-acc bg-acc-soft`}>
        <span className="truncate text-[12px] font-semibold text-tx">{r.farTitle}</span>
        <span className="truncate font-mono text-[11px] text-acc-tx">{r.farSub}</span>
      </div>
    </div>
  )
}
