import { useServers } from '../../stores/servers'
import { useView } from '../../stores/view'
import { FirstRunPage } from '../firstrun/FirstRunPage'
import { Inspector } from '../detail/Inspector'
import { KeysPage } from '../keys/KeysPage'
import { SecurityPage } from '../security/SecurityPage'
import { StacksPage } from '../stacks/StacksPage'
import { ServerList } from '../server/ServerList'
import { TunnelsPage } from '../tunnels/TunnelsPage'
import { ListHeader } from './ListHeader'

// Everything right of the sidebar: the Stacks, Tunnels, Keys or Security page,
// the welcome screen, or the server list beside the inspector.
export function MainContent({ onAdd }: { onAdd: () => void }) {
  const serverCount = useServers((s) => s.servers.length)
  const loaded = useServers((s) => s.loaded)
  const section = useView((s) => s.section)

  if (section === 'keys') {
    return (
      <main className="flex min-w-0 flex-1 bg-bg">
        <KeysPage />
      </main>
    )
  }
  if (section === 'security') {
    return (
      <main className="flex min-w-0 flex-1 bg-bg">
        <SecurityPage />
      </main>
    )
  }
  if (section === 'stacks') {
    return (
      <main className="flex min-w-0 flex-1 bg-bg">
        <StacksPage />
      </main>
    )
  }
  if (section === 'tunnels') {
    return (
      <main className="flex min-w-0 flex-1 bg-bg">
        <TunnelsPage />
      </main>
    )
  }
  if (section === 'welcome' || (loaded && serverCount === 0)) return <FirstRunPage onAdd={onAdd} />
  if (!loaded) return <main className="drag flex min-w-0 flex-1 bg-bg" />
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
