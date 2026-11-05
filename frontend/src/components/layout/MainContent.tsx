import { useServers } from '../../stores/servers'
import { useView } from '../../stores/view'
import { EmptyState } from '../EmptyState'
import { ServerDetail } from '../detail/ServerDetail'
import { KeysView } from '../keys/KeysView'

interface Props {
  onAdd: () => void
}

// The content area: the Keys page, the first-run hero with no servers, the
// selected server's detail page, or a quiet prompt to pick one.
export function MainContent({ onAdd }: Props) {
  const serverCount = useServers((s) => s.servers.length)
  const detailId = useView((s) => s.detailId)
  const detailExists = useServers((s) => s.servers.some((srv) => srv.id === detailId))
  const section = useView((s) => s.section)

  if (section === 'keys') return <KeysView />
  if (serverCount === 0) return <EmptyState onAdd={onAdd} />
  if (detailExists) return <ServerDetail />
  return (
    <div className="flex flex-1 items-center justify-center bg-bg0">
      <div className="flex w-[360px] flex-col items-center text-center">
        <div className="text-[15px] font-semibold text-text">No server selected</div>
        <div className="mt-[6px] text-[12.5px] leading-[1.55] text-textMuted">
          Pick a server in the sidebar to see its connection details and tunnels, or press ⌘K to jump to one.
        </div>
      </div>
    </div>
  )
}
