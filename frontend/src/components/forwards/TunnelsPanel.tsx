import { useEffect, useState } from 'react'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useForwards } from '../../stores/forwards'
import { envClassOf } from '../../lib/env'
import { ForwardForm } from '../server/ForwardForm'
import { TunnelCard } from './TunnelCard'

interface Props {
  serverId: string
  onClose: () => void
}

// Editing target: null = no form open, 'new' = adding, a PortForward = that
// card's edit form is open in its place. Only one form is open at a time —
// mirrors ForwardEditor's old state machine (now retired).
type Editing = PortForward | 'new' | null

// A stable empty fallback. Zustand v5 wraps React's useSyncExternalStore with
// NO selector memoization, so returning a fresh `[]` from the selector on every
// getSnapshot (the state before `load` populates byServer[serverId]) would fail
// React's snapshot-consistency check and spin an infinite render loop. One
// shared reference keeps the snapshot stable until real data lands.
const NO_FORWARDS: PortForward[] = []

// TunnelsPanel: the 392px right-side panel for one server's port forwards
// (dizayn manbasi: MainWindow.dc.html, panel=tunnels) — same frame as
// ServerForm (border-l, bg-bg1, 42px header, Esc pill), scoped to a single
// server. Opened via App.tsx's `tunnelsFor` state, mutually exclusive with
// the edit form at the same 392px slot.
export function TunnelsPanel({ serverId, onClose }: Props) {
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))
  const forwards = useForwards((s) => s.byServer[serverId] ?? NO_FORWARDS)
  const statusById = useForwards((s) => s.statusById)
  const [editing, setEditing] = useState<Editing>(null)

  useEffect(() => {
    void useForwards.getState().load(serverId)
    setEditing(null)
  }, [serverId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // isComposing guards against an IME commit keystroke closing the panel
      // mid-composition — same reasoning as ServerForm's Escape handler.
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const activeCount = forwards.filter((f) => statusById[f.id]?.state === 'running').length

  return (
    <div className="flex w-[392px] shrink-0 flex-col border-l border-border bg-bg1">
      <div className="flex h-[42px] shrink-0 items-center gap-[8px] border-b border-border px-[14px]">
        <span className="shrink-0 text-[13px] font-semibold">Tunnels</span>
        <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(server?.environment ?? 'none')}`} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-textMuted">
          {server?.name ?? ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="no-drag shrink-0 rounded-[3px] border border-border px-[5px] py-[1px] font-mono text-[10.5px] text-textDim"
        >
          Esc
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[6px] overflow-y-auto p-[8px]">
        {forwards.length === 0 && editing === null && (
          <span className="px-[2px] py-[4px] text-[11.5px] text-textDim">No tunnels yet.</span>
        )}
        {forwards.map((f) =>
          editing !== 'new' && editing?.id === f.id ? (
            <ForwardForm key={f.id} serverId={serverId} initial={f} onDone={() => setEditing(null)} />
          ) : (
            <TunnelCard key={f.id} forward={f} status={statusById[f.id]} onEdit={() => setEditing(f)} />
          ),
        )}
        {editing === 'new' && (
          <ForwardForm serverId={serverId} initial={null} onDone={() => setEditing(null)} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-[8px] border-t border-border px-[14px] py-[10px]">
        <button
          type="button"
          onClick={() => setEditing('new')}
          disabled={editing !== null}
          className="flex h-[30px] items-center gap-[5px] rounded-[5px] border border-borderStrong px-[12px] text-[12.5px] font-medium text-text disabled:opacity-50"
        >
          <span className="text-[14px] leading-none">+</span> Add tunnel
        </button>
        <span className="flex-1" />
        <span className="text-[11.5px] text-textDim">
          {activeCount} of {forwards.length} active
        </span>
      </div>
    </div>
  )
}
