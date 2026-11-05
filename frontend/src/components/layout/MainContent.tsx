import { useServers } from '../../stores/servers'
import { useView } from '../../stores/view'
import { EmptyState } from '../EmptyState'
import { Inspector } from '../detail/Inspector'
import { KeysView } from '../keys/KeysView'
import { ServerList } from '../server/ServerList'
import { ListHeader } from './ListHeader'

// Everything right of the sidebar: the Keys page, the first-run hero, or the
// server list beside the inspector.
export function MainContent({ onAdd }: { onAdd: () => void }) {
  const serverCount = useServers((s) => s.servers.length)
  const section = useView((s) => s.section)

  if (section === 'keys') {
    return (
      <main className="flex min-w-0 flex-1 flex-col bg-bg">
        <div className="drag h-[28px] shrink-0" />
        <KeysView />
      </main>
    )
  }
  if (serverCount === 0) {
    return (
      <main className="drag flex min-w-0 flex-1 bg-bg">
        <EmptyState onAdd={onAdd} />
      </main>
    )
  }
  return (
    <main className="flex min-w-0 flex-1 bg-bg">
      <div className="flex min-w-0 flex-1 flex-col">
        <ListHeader onAdd={onAdd} />
        <ServerList />
      </div>
      <Inspector />
    </main>
  )
}
