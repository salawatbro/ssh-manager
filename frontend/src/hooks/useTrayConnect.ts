import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { openServer } from '../lib/launch'

// Subscribes to tray:connect, emitted after a pinned menu-bar entry is clicked
// (the window is already shown by then). Lives in a hook, not inline in
// App.tsx, to keep that file under the line cap.
export function useTrayConnect() {
  useEffect(() => {
    const off = Events.On('tray:connect', (ev) => {
      openServer((ev.data as { serverID: string }).serverID)
    })
    return off
  }, [])
}
