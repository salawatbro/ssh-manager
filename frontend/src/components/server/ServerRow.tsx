import { Pin } from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { StatusDot } from './StatusDot'
import { openServer } from '../../lib/launch'
import type { RowDrag } from '../../hooks/useServerDrag'

interface Props {
  server: Server
  selected: boolean
  onSelect: () => void
  onContextMenu: (x: number, y: number) => void
  // Sidebar drag-reorder (spec 2026-07-21): handlers + insert indicator from
  // useServerDrag. The row stays a plain div; drag attaches to the wrapper so
  // the row's own click semantics are untouched.
  drag: RowDrag
}

// One sidebar row (redesign: Zish.dc.html sidebar). 26px, single line: status
// circle, name, then the target right-aligned in mono. A single click opens the
// server's detail page; double-click or Enter connects. The row is quiet on
// purpose: at 26px an icon cluster crowds the target text, and every action it
// could hold lives on the detail page and in the right-click menu.
export function ServerRow({ server, selected, onSelect, onContextMenu, drag }: Props) {
  const target = `${server.user}@${server.host}${server.port === 22 ? '' : `:${server.port}`}`

  return (
    <div
      className="relative ml-3 mr-[4px]"
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
    >
      {drag.indicator && (
        <span
          className={`pointer-events-none absolute inset-x-[6px] z-10 h-[2px] rounded-[1px] bg-accent ${
            drag.indicator === 'top' ? 'top-0' : 'bottom-0'
          }`}
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => openServer(server.id)}
        onKeyDown={(e) => {
          // Enter connects; without preventDefault the button would also fire
          // its click (select) for the same key press.
          if (e.key === 'Enter') {
            e.preventDefault()
            openServer(server.id)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e.clientX, e.clientY)
        }}
        className={`flex h-[26px] w-full items-center gap-[7px] rounded-[5px] px-[6px] text-left ${
          selected ? 'bg-bgSel' : 'hover:bg-bgSel'
        }`}
      >
        {/* UI-11: status is a circle; the environment square lives once per
            group on GroupHeader, so the two axes never collide on a row.
            There are still no live per-server statuses to read, so every row
            renders the idle ring — the component is what will carry them. */}
        <StatusDot status="disc" />
        <span className="shrink-0 truncate text-[13px] text-text">{server.name}</span>
        {server.pinned && <Pin size={10} className="shrink-0 text-textDim" fill="currentColor" />}
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10.5px] text-textDim">{target}</span>
      </button>
    </div>
  )
}
