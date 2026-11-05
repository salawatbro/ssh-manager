import { create } from 'zustand'

// Which server's icon and colour picker is open (row menu, inspector tile).
interface LookPickerState {
  serverId: string | null
  open: (serverId: string) => void
  close: () => void
}

export const useLookPicker = create<LookPickerState>((set) => ({
  serverId: null,
  open: (serverId) => set({ serverId }),
  close: () => set({ serverId: null }),
}))
