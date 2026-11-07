import { useState } from 'react'
import { ArrowDownAZ, ArrowUpDown, Clock, GripVertical, Plus, type LucideIcon } from 'lucide-react'
import { useServers } from '../../stores/servers'
import { useSidebar } from '../../stores/sidebar'
import { inScope, scopeTitle, SORT_LABEL, type SortMode } from '../../lib/serverList'
import { Button } from '../ui/Button'
import { ContextMenu } from '../ui/ContextMenu'

const SORTS: { mode: SortMode; icon: LucideIcon }[] = [
  { mode: 'manual', icon: GripVertical },
  { mode: 'recent', icon: Clock },
  { mode: 'name', icon: ArrowDownAZ },
]

// The list column's title band, also the window's drag handle.
export function ListHeader({ onAdd }: { onAdd: () => void }) {
  const scope = useSidebar((s) => s.scope)
  const sort = useSidebar((s) => s.sort)
  const count = useServers((s) => s.servers.filter((x) => inScope(x, scope)).length)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <header className="drag flex h-[52px] shrink-0 items-center gap-[8px] border-b border-line pl-[20px] pr-[12px]">
      <h1 className="m-0 min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-tx">{scopeTitle(scope)}</h1>
      <span className="text-[12px] tabular-nums text-tx3">{count}</span>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="no-drag"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ x: r.right, y: r.bottom + 4 })
        }}
      >
        <ArrowUpDown size={13} strokeWidth={1.9} />
        {SORT_LABEL[sort]}
      </Button>
      <Button variant="primary" size="sm" className="no-drag" onClick={onAdd}>
        <Plus size={14} strokeWidth={2.2} />
        New server
      </Button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          align="end"
          width={170}
          onClose={() => setMenu(null)}
          items={SORTS.map(({ mode, icon }) => ({
            label: SORT_LABEL[mode],
            icon,
            checked: mode === sort,
            run: () => useSidebar.getState().setSort(mode),
          }))}
        />
      )}
    </header>
  )
}
