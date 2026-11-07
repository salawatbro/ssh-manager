import { useLookPicker } from '../../stores/lookPicker'
import { useServers } from '../../stores/servers'
import { LookPicker } from './LookPicker'

export function ServerLookPicker() {
  const serverId = useLookPicker((s) => s.serverId)
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))
  if (!server) return null
  const close = () => useLookPicker.getState().close()
  return (
    <LookPicker
      key={server.id}
      name={server.name}
      group={server.group}
      kindLabel={`Server · ${server.group || 'Ungrouped'}`}
      initial={{ icon: server.icon, color: server.color }}
      onSave={(look) => useServers.getState().setLook(server.id, look.icon, look.color)}
      onClose={close}
    />
  )
}
