import { create } from 'zustand'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Status } from '../lib/status'
import type { QuickConnectTarget } from '../lib/quickConnect'

// A palette row is a server (Enter opens its terminal), a command (Enter runs
// it), or the synthetic quick-connect row (Enter saves + connects — spec
// 2026-07-20). `status` (UI-11 status circle) is derived once in
// CommandPalette from the live sessions store, so PaletteRow only ever
// renders it — it never reaches into stores/sessions itself.
export type PaletteRowData =
  | { kind: 'server'; server: Server; status: Status }
  | { kind: 'command'; id: string; label: string; run: () => void }
  | { kind: 'quick-connect'; target: QuickConnectTarget }

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
