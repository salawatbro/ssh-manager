import { Plus, Search, Settings } from 'lucide-react'
import { ServerList } from '../server/ServerList'
import { usePalette } from '../../stores/palette'
import { useSettings } from '../../stores/settings'

interface Props {
  onAdd: () => void
  onOpenTunnels: (id: string) => void
}

export function Sidebar({ onAdd, onOpenTunnels }: Props) {
  return (
    // TZ 12.1: sidebar is 220px
    <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-bg1">
      {/* Search box (dizayn manbasi: MainWindow.dc.html sidebar, ~28px, bottom
          divider): not a second search implementation — the ⌘K palette is
          the real search, so clicking OR focusing this just opens it. */}
      <div className="shrink-0 border-b border-border p-[8px]">
        <button
          type="button"
          onClick={() => usePalette.getState().show()}
          onFocus={() => usePalette.getState().show()}
          className="no-drag flex h-[28px] w-full items-center gap-[7px] rounded-[5px] border border-border bg-bg0 px-[8px] text-left"
        >
          <Search size={13} strokeWidth={2.2} className="shrink-0 text-textDim" />
          <span className="flex-1 truncate text-[12.5px] text-textDim">Search servers</span>
          <span className="shrink-0 rounded-[3px] border border-border px-[4px] py-[1px] font-mono text-[10.5px] text-textDim">
            ⌘K
          </span>
        </button>
      </div>
      <ServerList onOpenTunnels={onOpenTunnels} />
      <div className="flex h-[32px] shrink-0 items-center gap-[4px] border-t border-border px-[8px]">
        <button
          type="button"
          onClick={onAdd}
          className="no-drag flex h-[22px] items-center gap-[6px] rounded-[4px] bg-accentDim px-[8px] text-[12px] font-medium text-accentFg"
        >
          <Plus size={13} />
          Add server
        </button>
        <div className="flex-1" />
        <button
          type="button"
          title="Settings"
          onClick={() => useSettings.getState().show()}
          className="no-drag flex h-[22px] w-[22px] items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text"
        >
          <Settings size={15} />
        </button>
      </div>
    </div>
  )
}
