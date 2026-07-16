import { create } from 'zustand'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// A palette row is either a server (Enter opens its terminal) or a command
// (Enter runs it). Commands are supplied by the CommandPalette from app state.
export type PaletteRowData =
  | { kind: 'server'; server: Server }
  | { kind: 'command'; id: string; label: string; run: () => void }

interface PaletteState {
  open: boolean
  toggle: () => void
  show: () => void
  hide: () => void
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
