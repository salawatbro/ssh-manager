import { create } from 'zustand'

export type Section = 'servers' | 'keys'

// Which page owns the content area: a server's detail page (null shows the
// empty state) or the agent's Keys page.
interface ViewState {
  section: Section
  detailId: string | null
  showDetail: (serverId: string) => void
  closeDetail: () => void
  showKeys: () => void
  showServers: () => void
}

export const useView = create<ViewState>((set) => ({
  section: 'servers',
  detailId: null,
  showDetail: (serverId) => set({ detailId: serverId, section: 'servers' }),
  closeDetail: () => set({ detailId: null }),
  showKeys: () => set({ section: 'keys' }),
  showServers: () => set({ section: 'servers' }),
}))
