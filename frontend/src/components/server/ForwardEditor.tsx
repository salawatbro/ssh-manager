import { useEffect, useState } from 'react'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useForwards } from '../../stores/forwards'
import { ForwardForm } from './ForwardForm'

interface Props {
  // Only rendered for a persisted server — a forward's server_id FK
  // requires the server to already exist, so ServerForm only mounts this
  // once `serverId` is non-null.
  serverId: string
}

// Editing target: null = no form open, 'new' = adding, a PortForward = that
// row's edit form is open in place of its read-only row. Only one form is
// open at a time.
type Editing = PortForward | 'new' | null

// A stable empty fallback. Zustand v5 wraps React's useSyncExternalStore with
// NO selector memoization, so returning a fresh `[]` from the selector on every
// getSnapshot (the state before `load` populates byServer[serverId]) would fail
// React's snapshot-consistency check and spin an infinite render loop. One
// shared reference keeps the snapshot stable until real data lands.
const NO_FORWARDS: PortForward[] = []

export function ForwardEditor({ serverId }: Props) {
  const forwards = useForwards((s) => s.byServer[serverId] ?? NO_FORWARDS)
  const [editing, setEditing] = useState<Editing>(null)

  useEffect(() => {
    void useForwards.getState().load(serverId)
    setEditing(null)
  }, [serverId])

  return (
    <div className="flex flex-col gap-[8px] border-t border-border p-[14px]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-textMuted">Port forwards</span>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="rounded-[4px] border border-border px-[7px] py-[2px] text-[11px] text-textMuted"
          >
            + Add
          </button>
        )}
      </div>

      {forwards.length === 0 && editing === null && (
        <span className="text-[11px] text-textDim">No forwards yet.</span>
      )}

      <div className="flex flex-col gap-[6px]">
        {forwards.map((f) =>
          editing !== 'new' && editing?.id === f.id ? (
            <ForwardForm key={f.id} serverId={serverId} initial={f} onDone={() => setEditing(null)} />
          ) : (
            <ForwardRow
              key={f.id}
              forward={f}
              onEdit={() => setEditing(f)}
              onDelete={() => void useForwards.getState().remove(f.id, serverId)}
            />
          ),
        )}
      </div>

      {editing === 'new' && (
        <ForwardForm serverId={serverId} initial={null} onDone={() => setEditing(null)} />
      )}
    </div>
  )
}

function ForwardRow({
  forward,
  onEdit,
  onDelete,
}: {
  forward: PortForward
  onEdit: () => void
  onDelete: () => void
}) {
  // Mirrors ServerForm's confirmDelete: first click arms it, second confirms
  // — a saved forward has no undo, so a stray click must not remove it.
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="flex items-center gap-[8px] rounded-[5px] border border-border px-[9px] py-[7px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className="truncate text-[12px] text-text">
          {forward.name}
          <span className="ml-[6px] text-[10px] font-medium text-textDim">
            {forward.type === ForwardType.ForwardLocal ? 'Local' : 'Remote'}
          </span>
        </span>
        <span className="truncate font-mono text-[11px] text-textDim">
          {forward.bindAddr}:{forward.bindPort} → {forward.destHost}:{forward.destPort}
        </span>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-[11px] text-textMuted">
        Edit
      </button>
      <button
        type="button"
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        className={`shrink-0 text-[11px] ${confirm ? 'font-semibold text-stFailed' : 'text-textMuted'}`}
      >
        {confirm ? 'Confirm?' : 'Delete'}
      </button>
    </div>
  )
}
