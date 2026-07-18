import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { useServers } from '../stores/servers'
import { useSessions } from '../stores/sessions'

// Subscribes to tray:connect, emitted after a pinned menu-bar entry is clicked
// (the window is already shown by then). Resolves the server from the servers
// store and opens or focuses it. Lives in a hook, not inline in App.tsx, to
// keep that file under the 200-line cap.
export function useTrayConnect() {
  useEffect(() => {
    const off = Events.On('tray:connect', (ev) => {
      const id = (ev.data as { serverID: string }).serverID
      const srv = useServers.getState().servers.find((s) => s.id === id)
      if (srv) useSessions.getState().openOrFocus(srv)
    })
    return off
  }, [])
}
