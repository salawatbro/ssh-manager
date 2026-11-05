import { useEffect, useMemo, useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useSidebar } from '../../stores/sidebar'
import { useForwards } from '../../stores/forwards'
import { useServerForm } from '../../stores/serverForm'
import { groupRuns, inScope, sharedEnv, tunnelSummary } from '../../lib/serverList'
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
  const scope = useSidebar((s) => s.scope)
  const sort = useSidebar((s) => s.sort)
  const collapsed = useSidebar((s) => s.collapsed)
  const byServer = useForwards((s) => s.byServer)
  const statusById = useForwards((s) => s.statusById)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const visible = useMemo(() => servers.filter((s) => inScope(s, scope)), [servers, scope])
  const runs = useMemo(() => groupRuns(visible, sort), [visible, sort])
  const nameById = useMemo(() => new Map(servers.map((s) => [s.id, s.name])), [servers])
  // Reordering only makes sense on the stored order of whole groups.
  const reorderable = sort === 'manual' && scope.kind !== 'tag'
  const { rowProps } = useServerDrag(reorderable)

  // Tunnel chips need every server's forwards, not just the selected one's.
  useEffect(() => {
    const loaded = useForwards.getState().byServer
    for (const s of servers) if (!(s.id in loaded)) void useForwards.getState().load(s.id)
  }, [servers])

  // The inspector always has a server to show while the list has one.
  useEffect(() => {
    if (visible.length > 0 && !visible.some((s) => s.id === selectedId)) useServers.getState().select(visible[0].id)
  }, [visible, selectedId])

  if (visible.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-[8px] text-center">
        <span className="text-[12.5px] text-tx3">No servers here.</span>
        <button
          type="button"
          onClick={() => useSidebar.getState().setScope({ kind: 'all' })}
          className="text-[12px] text-acc-tx hover:underline"
        >
          Show all servers
        </button>
      </div>
    )
  }

  return (
    <section aria-label="Server list" className="min-w-0 flex-1 overflow-y-auto px-[10px] pb-[12px] pt-[6px]">
      {runs.map((run) => {
        const folded = scope.kind === 'all' && !!collapsed[run.group]
        return (
          <div key={run.group}>
            <GroupHeader
              group={run.group}
              count={run.servers.length}
              env={sharedEnv(run.servers)}
              collapsed={folded}
              onToggle={() => useSidebar.getState().toggleGroup(run.group)}
            />
            {!folded &&
              run.servers.map((s) => (
                <ServerRow
                  key={s.id}
                  server={s}
                  via={s.jumpId ? (nameById.get(s.jumpId) ?? null) : null}
                  tunnels={tunnelSummary(
                    (byServer[s.id] ?? []).map((f) => f.id),
                    (id) => statusById[id]?.state,
                  )}
                  selected={s.id === selectedId}
                  onSelect={() => useServers.getState().select(s.id)}
                  onContextMenu={(x, y) => setMenu({ server: s, x, y })}
                  drag={rowProps(s)}
                />
              ))}
          </div>
        )
      })}
      {menu && (
        <ServerContextMenu
          server={menu.server}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => useServerForm.getState().openEdit(menu.server.id)}
          reorderable={reorderable}
        />
      )}
    </section>
  )
}
