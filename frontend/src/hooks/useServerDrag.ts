import { useState } from 'react'
import type { DragEvent } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useServers } from '../stores/servers'
import { toastError } from '../stores/toasts'

type Ev = DragEvent<HTMLElement>

// Within-group drag-reorder for the sidebar (spec 2026-07-21 §5). The hook
// owns the transient drag state; each row gets its handlers via rowProps.
// A drop commits the group's FULL id list to SetGroupOrder — the sole
// sort_order writer — then reloads: no optimistic splice, the backend order
// is the truth and the round-trip is one local sqlite write.
export interface RowDrag {
  draggable: boolean
  indicator: 'top' | 'bottom' | null
  onDragStart: (e: Ev) => void
  onDragOver: (e: Ev) => void
  onDragLeave: () => void
  onDrop: (e: Ev) => void
  onDragEnd: () => void
}

function isAfter(e: Ev): boolean {
  const r = e.currentTarget.getBoundingClientRect()
  return e.clientY > r.top + r.height / 2
}

export function useServerDrag(enabled: boolean) {
  const [drag, setDrag] = useState<{ id: string; group: string } | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)

  async function commit(targetId: string, after: boolean) {
    const d = drag
    setDrag(null)
    setOver(null)
    if (!d || d.id === targetId) return
    const { servers, load } = useServers.getState()
    const ids = servers.filter((s) => s.group === d.group).map((s) => s.id)
    const from = ids.indexOf(d.id)
    if (from < 0) return
    ids.splice(from, 1)
    const to = ids.indexOf(targetId)
    if (to < 0) return
    ids.splice(to + (after ? 1 : 0), 0, d.id)
    try {
      await ServerService.SetGroupOrder(d.group, ids)
      await load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  }

  function rowProps(server: Server): RowDrag {
    // A row is a valid drop target only mid-drag, within the SAME group,
    // and never onto itself — cross-group drops stay rejected (spec §2).
    const target = drag !== null && drag.group === server.group && drag.id !== server.id
    return {
      draggable: enabled,
      indicator: target && over?.id === server.id ? (over.after ? 'bottom' : 'top') : null,
      onDragStart: (e) => {
        if (!enabled) return
        e.dataTransfer.effectAllowed = 'move'
        // WebKit requires data for a drag to actually start.
        e.dataTransfer.setData('text/plain', server.id)
        setDrag({ id: server.id, group: server.group })
      },
      onDragOver: (e) => {
        if (!target) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const after = isAfter(e)
        setOver((o) => (o?.id === server.id && o.after === after ? o : { id: server.id, after }))
      },
      onDragLeave: () => {
        setOver((o) => (o?.id === server.id ? null : o))
      },
      onDrop: (e) => {
        if (!target) return
        e.preventDefault()
        void commit(server.id, isAfter(e))
      },
      onDragEnd: () => {
        setDrag(null)
        setOver(null)
      },
    }
  }

  return { rowProps }
}
