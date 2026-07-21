import { useMemo } from 'react'
import { Plus, Search, Settings, X } from 'lucide-react'
import { ServerList } from '../server/ServerList'
import { useSettings } from '../../stores/settings'
import { useSidebar } from '../../stores/sidebar'
import { useServers } from '../../stores/servers'
import { allTags } from '../../lib/sidebarFilter'

interface Props {
  onAdd: () => void
  onOpenTunnels: (id: string) => void
}

export function Sidebar({ onAdd, onOpenTunnels }: Props) {
  const query = useSidebar((s) => s.query)
  const tags = useSidebar((s) => s.tags)
  const setQuery = useSidebar((s) => s.setQuery)
  const toggleTag = useSidebar((s) => s.toggleTag)
  const clearFilter = useSidebar((s) => s.clearFilter)
  const servers = useServers((s) => s.servers)
  const distinct = useMemo(() => allTags(servers), [servers])

  return (
    // TZ 12.1: sidebar is 220px
    <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-bg1">
      {/* Filter box (spec 2026-07-21): a REAL inline filter now — typing
          narrows the list live (ServerList reads the same store). The ⌘K
          chip is a reminder of the palette's global binding, shown only
          while the box is empty; with text it yields to the × clear button.
          Esc and × both clear text AND selected tags in one gesture. */}
      <div className="shrink-0 border-b border-border p-[8px]">
        <div className="no-drag flex h-[28px] w-full items-center gap-[7px] rounded-[5px] border border-border bg-bg0 px-[8px] focus-within:border-borderStrong">
          <Search size={13} strokeWidth={2.2} className="shrink-0 text-textDim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                clearFilter()
              }
            }}
            placeholder="Filter servers"
            aria-label="Filter servers"
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-textDim"
          />
          {query ? (
            <button
              type="button"
              title="Clear filter"
              onClick={clearFilter}
              className="shrink-0 text-textDim hover:text-text"
            >
              <X size={12} />
            </button>
          ) : (
            <span className="shrink-0 rounded-[3px] border border-border px-[4px] py-[1px] font-mono text-[10.5px] text-textDim">
              ⌘K
            </span>
          )}
        </div>
        {/* Tag chips: distinct tags in first-seen order, multi-select OR
            (spec §6). Rendered only when any tag exists — a tag-free setup
            pays zero pixels for the feature. */}
        {distinct.length > 0 && (
          <div className="mt-[6px] flex flex-wrap gap-[4px]">
            {distinct.map((tag) => {
              const active = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={`no-drag h-[18px] rounded-[4px] px-[6px] text-[10.5px] font-medium ${
                    active
                      ? 'bg-accentDim text-accentFg'
                      : 'border border-border text-textDim hover:bg-bg2 hover:text-text'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        )}
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
