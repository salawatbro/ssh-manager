import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { useLock } from '../stores/lock'
import { useServers } from '../stores/servers'

// The launcher window shares no store with this one: what it changes reaches
// here as events. A connect bumps "last used" (and a quick connect adds a
// server); Touch ID there unlocks the backend, so the overlay follows it.
export function useWindowSync() {
  useEffect(() => {
    const offServers = Events.On('servers:changed', () => void useServers.getState().load())
    const offLock = Events.On('lock:changed', (ev) => useLock.getState().setLocked(ev.data))
    return () => {
      offServers()
      offLock()
    }
  }, [])
}
