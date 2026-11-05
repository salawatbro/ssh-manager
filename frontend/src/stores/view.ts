import { create } from 'zustand'
import { useKeys } from './keys'
import { useServers } from './servers'
import { useSettings } from './settings'
import { useSidebar } from './sidebar'
import { inScope } from '../lib/serverList'

// 'welcome' is the first-run screen; it also shows on 'servers' while there
// are no servers.
export type Section = 'servers' | 'welcome' | 'stacks' | 'tunnels' | 'keys' | 'security'

// Which page owns the main column. The server list's inspector always shows
// the selected server (useServers.selectedId). Going to a page closes the
// settings page that covers them.
interface ViewState {
  section: Section
  showDetail: (serverId: string) => void
  // keyId opens that key's sheet on the Keys page.
  showKeys: (keyId?: string) => void
  showServers: () => void
  showWelcome: () => void
  showStacks: () => void
  showTunnels: () => void
  showSecurity: () => void
}

export const useView = create<ViewState>((set) => {
  const go = (section: Section) => {
    useSettings.getState().close()
    set({ section })
  }
  return {
    section: 'servers',
    showDetail: (serverId) => {
      const server = useServers.getState().servers.find((s) => s.id === serverId)
      const sidebar = useSidebar.getState()
      if (server && !inScope(server, sidebar.scope)) sidebar.setScope({ kind: 'all' })
      useServers.getState().select(serverId)
      go('servers')
    },
    showKeys: (keyId) => {
      useKeys.getState().openSheet(keyId ?? null)
      go('keys')
    },
    showServers: () => go('servers'),
    showWelcome: () => go('welcome'),
    showStacks: () => go('stacks'),
    showTunnels: () => go('tunnels'),
    showSecurity: () => go('security'),
  }
})
