import { create } from 'zustand'
import type { LucideIcon } from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { QuickConnectTarget } from '../lib/quickConnect'

// A palette row is a server (Enter connects to it), a command (Enter runs it),
// or the synthetic quick-connect row (Enter opens the matching server when one
// exists, otherwise saves the target as a new server and connects — spec
// 2026-07-20).
export type PaletteRowData =
  | { kind: 'server'; server: Server }
  // A command's icon and hint are the design's palette columns; the hint is
  // only ever a real binding (see components/palette/commands.ts).
  | { kind: 'command'; id: string; label: string; icon: LucideIcon; hint?: string; run: () => void }
  | {
      kind: 'quick-connect'
      target: QuickConnectTarget
      // Absent means no existing server matches the target; present names
      // the one Enter will open instead of creating a duplicate.
      existingName?: string
    }

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
