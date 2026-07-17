import { Plus } from 'lucide-react'
import { ServerList } from '../server/ServerList'

interface Props {
  onAdd: () => void
  onOpenTunnels: (id: string) => void
}

export function Sidebar({ onAdd, onOpenTunnels }: Props) {
  return (
    // TZ 12.1: sidebar is 220px
    <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-bg1">
      <ServerList onOpenTunnels={onOpenTunnels} />
      <div className="flex h-[32px] shrink-0 items-center border-t border-border px-[8px]">
        <button
          type="button"
          onClick={onAdd}
          className="no-drag flex h-[22px] items-center gap-[6px] rounded-[4px] bg-accentDim px-[8px] text-[12px] font-medium text-accentFg"
        >
          <Plus size={13} />
          Add server
        </button>
      </div>
    </div>
  )
}
