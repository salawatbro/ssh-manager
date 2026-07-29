import { useMemo, useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { groupServers, useServers } from '../../stores/servers'
import { useSidebar } from '../../stores/sidebar'
import { useView } from '../../stores/view'
import { useServerForm } from '../../stores/serverForm'
import { filterServers } from '../../lib/sidebarFilter'
import { useServerDrag } from '../../hooks/useServerDrag'
import { GroupHeader } from './GroupHeader'
import { ServerRow } from './ServerRow'
import { ServerContextMenu } from './ServerContextMenu'

interface MenuState {
  server: Server
  x: number
  y: number
}

export function ServerList() {
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const select = useServers((s) => s.select)
  const query = useSidebar((s) => s.query)
  const tags = useSidebar((s) => s.tags)
  const collapsed = useSidebar((s) => s.collapsed)
  const toggleGroup = useSidebar((s) => s.toggleGroup)
  const clearFilter = useSidebar((s) => s.clearFilter)
  // One open menu at a time, keyed by the server it targets — a second
  // right-click (on the same or a different row) just replaces it.
  const [menu, setMenu] = useState<MenuState | null>(null)

  // Filter FIRST, then fold into group runs — filterServers preserves the
  // backend order, so runs stay intact. While any filter is active the
  // stored collapse state is overridden (matches inside a folded group must
  // be visible) but never mutated.
  const filtering = query.trim() !== '' || tags.length > 0
  const { rowProps } = useServerDrag(!filtering)
  const visible = useMemo(() => filterServers(servers, query, tags), [servers, query, tags])
  const groups = groupServers(visible)

  if (servers.length === 0) {
    // dizayn manbasi: EmptyState.dc.html sidebar — a centered "No servers
    // yet" line fills the list area instead of leaving it blank.
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-[20px] text-center">
        <span className="text-[12px] leading-[1.5] text-textDim">No servers yet</span>
      </div>
    )
  }

  if (visible.length === 0) {
    // The redesign turns the dead end into an exit: say which filters are
    // hiding everything, and offer the one gesture that clears them.
    return (
      <div className="min-h-0 flex-1 px-[10px] pt-[16px]">
        <div className="text-[12px] leading-[1.5] text-textDim">Nothing matches these filters.</div>
        <button
          type="button"
          onClick={clearFilter}
          className="mt-[6px] block text-[11.5px] text-accentFg hover:text-accent"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-[4px]">
      {groups.map((g) => (
        // key is the raw group value (possibly '') so it stays distinct from
        // the literal string "Ungrouped" a user could name a group — only the
        // label shown below folds '' into "Ungrouped". The collapse store is
        // keyed the same way.
        <div key={g.group}>
          <GroupHeader
            group={g.group || 'Ungrouped'}
            count={g.servers.length}
            collapsed={!filtering && !!collapsed[g.group]}
            onToggle={() => toggleGroup(g.group)}
          />
          {(filtering || !collapsed[g.group]) &&
            g.servers.map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                selected={s.id === selectedId}
                onSelect={() => {
                  select(s.id)
                  useView.getState().showDetail(s.id)
                }}
                onContextMenu={(x, y) => setMenu({ server: s, x, y })}
                drag={rowProps(s)}
              />
            ))}
        </div>
      ))}
      {menu && (
        <ServerContextMenu
          server={menu.server}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => useServerForm.getState().openEdit(menu.server.id)}
          onTunnels={() => useView.getState().showDetail(menu.server.id)}
          filtering={filtering}
        />
      )}
    </div>
  )
}
