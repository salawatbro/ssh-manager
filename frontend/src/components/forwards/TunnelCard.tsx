import { useState, type MouseEvent } from 'react'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useForwards, type ForwardStatus } from '../../stores/forwards'
import { forwardDotStatus } from '../../lib/forwardStatus'
import { StatusDot } from '../server/StatusDot'

interface Props {
  forward: PortForward
  status: ForwardStatus | undefined
  // Clicking the card body (anywhere but the toggle) opens it for editing,
  // replacing this card with a ForwardForm — TunnelsPanel owns that swap.
  onEdit: () => void
}

// One tunnel row in TunnelsPanel (dizayn manbasi: MainWindow.dc.html
// panel=tunnels): a type badge, name + mono `bindPort → destHost:destPort`
// subtitle, a status circle, and a 28×16 toggle that starts/stops the
// tunnel. Dynamic (-D) forwards have no fixed destination, so their
// subtitle reads `SOCKS5 · bindAddr:bindPort` instead. The badge and name
// only light up (accentDim / text) while the
// tunnel is actually running — a card whose last start attempt errored
// still shows its toggle in the "off" position, matching the design's
// broken-forward example.
export function TunnelCard({ forward, status, onEdit }: Props) {
  // Synchronous failures from Start/Stop itself (e.g. the RPC call throws)
  // land here; an async 'error' state pushed later via forward:status (a
  // tunnel that accepted the toggle but then failed to bind/connect) is
  // read straight from `status.detail` instead. Either way only one banner
  // shows at a time, in the same spot the design reserves for it.
  const [toggleErr, setToggleErr] = useState<string | null>(null)
  const running = status?.state === 'running'
  const errorMsg = toggleErr ?? (status?.state === 'error' ? status.detail : null)

  async function onToggle(e: MouseEvent) {
    e.stopPropagation()
    setToggleErr(null)
    const err = running
      ? await useForwards.getState().stop(forward.id)
      : await useForwards.getState().start(forward.id)
    if (err) setToggleErr(err)
  }

  return (
    <div
      onClick={onEdit}
      className={`flex flex-col overflow-hidden rounded-[6px] border bg-bg0 ${
        errorMsg ? 'border-stFailed' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-[10px] px-[10px] py-[9px]">
        <span
          className={`shrink-0 rounded-[3px] px-[5px] py-[2px] font-mono text-[9.5px] font-medium ${
            running ? 'bg-accentDim text-accentFg' : 'border border-border text-textDim'
          }`}
        >
          {forward.type === ForwardType.ForwardLocal
            ? '-L'
            : forward.type === ForwardType.ForwardRemote
              ? '-R'
              : '-D'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className={`truncate text-[12.5px] ${running ? 'text-text' : 'text-textMuted'}`}>
            {forward.name}
          </span>
          <span className="truncate font-mono text-[11px] text-textDim">
            {forward.type === ForwardType.ForwardDynamic
              ? `SOCKS5 · ${forward.bindAddr}:${forward.bindPort}`
              : `${forward.bindPort} → ${forward.destHost}:${forward.destPort}`}
          </span>
        </div>
        <StatusDot status={forwardDotStatus(status?.state)} size={6} />
        <button
          type="button"
          onClick={(e) => void onToggle(e)}
          aria-label={running ? 'Stop tunnel' : 'Start tunnel'}
          className={`box-border flex h-[16px] w-[28px] shrink-0 items-center rounded-[8px] ${
            running
              ? 'justify-end bg-accent px-[2px]'
              : 'justify-start border border-borderStrong bg-bg2 px-[1px]'
          }`}
        >
          <span className={`h-[12px] w-[12px] rounded-full ${running ? 'bg-text' : 'bg-textDim'}`} />
        </button>
      </div>
      {errorMsg && (
        <div className="border-t border-border bg-[rgba(229,84,75,.08)] px-[10px] py-[7px] text-[11.5px] text-stFailed">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
