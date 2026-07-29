import { useMemo, useState } from 'react'
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

// How many tag pills fit before the row starts eating the list's height. Past
// this the rest hide behind a `+N` expander (Zish.dc.html sidebar).
const TAG_LIMIT = 6

export function Sidebar({ onAdd, onOpenTunnels }: Props) {
  const query = useSidebar((s) => s.query)
  const tags = useSidebar((s) => s.tags)
  const setQuery = useSidebar((s) => s.setQuery)
  const toggleTag = useSidebar((s) => s.toggleTag)
  const clearFilter = useSidebar((s) => s.clearFilter)
  const servers = useServers((s) => s.servers)
  const distinct = useMemo(() => allTags(servers), [servers])
  // Purely presentational, and reset by a remount — no reason to persist it.
  const [tagsExpanded, setTagsExpanded] = useState(false)

  // Collapsed, the row shows the first N tags PLUS any active tag that would
  // otherwise be hidden: a filter you can't see is a filter you can't undo.
  const shown = tagsExpanded
    ? distinct
    : [...distinct.slice(0, TAG_LIMIT), ...tags.filter((t) => !distinct.slice(0, TAG_LIMIT).includes(t))]

  return (
    // TZ 12.1: sidebar is 220px
    <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-bg1">
      {/* Filter box (spec 2026-07-21): a REAL inline filter — typing narrows
          the list live (ServerList reads the same store). The ⌘K chip is a
          reminder of the palette's global binding, shown only while the box is
          empty; with text it yields to the × clear button. Esc and × both clear
          text AND selected tags in one gesture. */}
      <div className="shrink-0 border-b border-border px-[10px] pt-[10px] pb-3">
        <div className="no-drag flex h-[28px] w-full items-center gap-[7px] rounded-[5px] border border-border bg-bg0 px-[9px] focus-within:border-borderStrong">
          <Search size={12} strokeWidth={2.2} className="shrink-0 text-textDim" />
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
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-text outline-none placeholder:text-textDim"
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
            <span className="shrink-0 rounded-[3px] bg-bg2 px-[4px] py-[1px] font-mono text-[10px] text-textDim">
              ⌘K
            </span>
          )}
        </div>
        {/* Tag pills: distinct tags in first-seen order, multi-select OR — a
            server matches if it carries ANY selected tag (lib/sidebarFilter.ts
            owns that rule). Rendered only when a tag exists, so a tag-free
            setup pays zero pixels for the feature. */}
        {distinct.length > 0 && (
          <div
            className={`mt-[10px] flex flex-wrap gap-[6px] ${
              tagsExpanded ? 'max-h-[120px] overflow-y-auto' : ''
            }`}
          >
            {shown.map((tag) => {
              const active = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={`no-drag flex h-[20px] items-center rounded-full px-[8px] text-[10.5px] ${
                    active
                      ? 'bg-accentDim text-accentFg'
                      : 'border border-border text-textDim hover:bg-bg2 hover:text-text'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
            {distinct.length > TAG_LIMIT && (
              <button
                type="button"
                onClick={() => setTagsExpanded((v) => !v)}
                className="no-drag flex h-[20px] items-center rounded-full border border-borderStrong px-[8px] text-[10.5px] text-textMuted hover:text-text"
              >
                {tagsExpanded ? 'Less' : `+${distinct.length - TAG_LIMIT}`}
              </button>
            )}
          </div>
        )}
      </div>
      <ServerList onOpenTunnels={onOpenTunnels} />
      <div className="flex h-[32px] shrink-0 items-center gap-[6px] border-t border-border px-[8px]">
        <button
          type="button"
          onClick={onAdd}
          className="no-drag flex h-[22px] items-center gap-[4px] rounded-[5px] bg-accentDim px-[8px] text-[11.5px] font-medium text-accentFg"
        >
          <Plus size={13} />
          Add server
        </button>
        <div className="flex-1" />
        <button
          type="button"
          title="Settings"
          onClick={() => useSettings.getState().show()}
          className="no-drag flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-textDim hover:bg-bgSel hover:text-text"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  )
}
