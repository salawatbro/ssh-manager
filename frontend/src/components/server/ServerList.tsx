import { useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { groupServers, useServers } from '../../stores/servers'
import { GroupHeader } from './GroupHeader'
import { ServerRow } from './ServerRow'
import { ServerContextMenu } from './ServerContextMenu'

interface MenuState {
  server: Server
  x: number
  y: number
}

interface Props {
  // Opens TunnelsPanel for the given server id (App.tsx's `tunnelsFor`).
  onOpenTunnels: (id: string) => void
}

export function ServerList({ onOpenTunnels }: Props) {
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const select = useServers((s) => s.select)
  // One open menu at a time, keyed by the server it targets — a second
  // right-click (on the same or a different row) just replaces it.
  const [menu, setMenu] = useState<MenuState | null>(null)

  const groups = groupServers(servers)

  if (servers.length === 0) {
    // dizayn manbasi: EmptyState.dc.html sidebar — a centered "No servers
    // yet" line fills the list area instead of leaving it blank.
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-[20px] text-center">
        <span className="text-[12px] leading-[1.5] text-textDim">No servers yet</span>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-[4px]">
      {groups.map((g) => (
        // key is the raw group value (possibly '') so it stays distinct from
        // the literal string "Ungrouped" a user could name a group — only the
        // label shown below folds '' into "Ungrouped".
        <div key={g.group}>
          <GroupHeader
            group={g.group || 'Ungrouped'}
            count={g.servers.length}
            env={g.servers[0].environment}
          />
          {g.servers.map((s) => (
            <ServerRow
              key={s.id}
              server={s}
              selected={s.id === selectedId}
              onSelect={() => select(s.id)}
              onContextMenu={(x, y) => setMenu({ server: s, x, y })}
              onTunnels={() => onOpenTunnels(s.id)}
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
          onEdit={() => select(menu.server.id)}
          onTunnels={() => onOpenTunnels(menu.server.id)}
        />
      )}
    </div>
  )
}
