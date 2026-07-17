import { useEffect, useMemo } from 'react'
import { useServers } from '../../stores/servers'
import { useForwards } from '../../stores/forwards'
import { forwardDotStatus } from '../../lib/forwardStatus'
import { StatusDot } from '../server/StatusDot'

interface Props {
  onClose: () => void
}

// TunnelsPanel is a compact popover — opened from the status bar's
// "N tunnels" segment (App.tsx) or the palette's "Tunnels" command — that
// lists every currently-running tunnel (forward:status state 'running'),
// regardless of which server's ForwardEditor happens to be open, with a Stop
// button for each. A full side panel (like ServerForm) would duplicate that
// row UI for little benefit; this stays within the line budget instead.
export function TunnelsPanel({ onClose }: Props) {
  const servers = useServers((s) => s.servers)
  const byServer = useForwards((s) => s.byServer)
  const statusById = useForwards((s) => s.statusById)

  useEffect(() => {
    // byServer only has entries for servers whose ForwardEditor was opened
    // this session (Task 9's lazy `load`). Load every server's forwards here
    // too, so a tunnel started earlier still resolves to a name below
    // instead of falling back to its bare id.
    for (const srv of servers) void useForwards.getState().load(srv.id)
  }, [servers])

  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const list of Object.values(byServer)) {
      for (const f of list) m.set(f.id, f.name)
    }
    return m
  }, [byServer])

  const running = Object.entries(statusById).filter(([, st]) => st.state === 'running')

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-start" onMouseDown={onClose}>
      <div
        className="mb-[32px] ml-[12px] flex max-h-[320px] w-[300px] flex-col overflow-hidden rounded-[8px] border border-borderStrong bg-bg2 shadow-[0_16px_50px_rgba(0,0,0,.5)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-[32px] shrink-0 items-center justify-between border-b border-border px-[12px]">
          <span className="text-[12px] font-semibold text-text">Tunnels</span>
          <button type="button" onClick={onClose} className="text-[11px] text-textMuted">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-[7px]">
          {running.length === 0 && (
            <span className="block px-[5px] py-[4px] text-[11.5px] text-textDim">No tunnels running.</span>
          )}
          {running.map(([id, st]) => (
            <div key={id} className="flex items-center gap-[8px] rounded-[5px] px-[5px] py-[6px]">
              <StatusDot status={forwardDotStatus(st.state)} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-text">{names.get(id) ?? id}</span>
              <button
                type="button"
                onClick={() => void useForwards.getState().stop(id)}
                className="shrink-0 text-[11px] text-textMuted"
              >
                Stop
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
