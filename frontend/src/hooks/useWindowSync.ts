import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { watchFullscreen } from '../stores/fullscreen'
import { useLock } from '../stores/lock'
import { useServers } from '../stores/servers'
import { useSettings } from '../stores/settings'

// The launcher and the menu-bar panel share no store with this window: what
// they change reaches here as events. A connect bumps "last used" (and a
// quick connect adds a server); Touch ID there unlocks the backend, so the
// overlay follows it; the panel's Settings opens the settings page here.
// Fullscreen is this window's own state, which the sidebars' top band follows.
export function useWindowSync() {
  useEffect(() => {
    const offs = [
      Events.On('servers:changed', () => void useServers.getState().load()),
      Events.On('lock:changed', (ev) => useLock.getState().setLocked(ev.data)),
      Events.On('settings:open', () => useSettings.getState().show()),
      watchFullscreen(),
    ]
    return () => offs.forEach((off) => off())
  }, [])
}
