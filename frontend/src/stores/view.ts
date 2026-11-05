import { create } from 'zustand'
import { useServers } from './servers'
import { useSidebar } from './sidebar'
import { inScope } from '../lib/serverList'

export type Section = 'servers' | 'keys'

// Which page owns the main column. The server list's inspector always shows
// the selected server (useServers.selectedId).
interface ViewState {
  section: Section
  showDetail: (serverId: string) => void
  showKeys: () => void
  showServers: () => void
}

export const useView = create<ViewState>((set) => ({
  section: 'servers',
  showDetail: (serverId) => {
    const server = useServers.getState().servers.find((s) => s.id === serverId)
    const sidebar = useSidebar.getState()
    if (server && !inScope(server, sidebar.scope)) sidebar.setScope({ kind: 'all' })
    useServers.getState().select(serverId)
    set({ section: 'servers' })
  },
  showKeys: () => set({ section: 'keys' }),
  showServers: () => set({ section: 'servers' }),
}))
