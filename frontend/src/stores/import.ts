import { create } from 'zustand'
import { ImportService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { ImportPreview } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface ImportState {
  open: boolean
  preview: ImportPreview | null
  selected: Record<string, boolean>
  show: () => Promise<void>
  close: () => void
  toggle: (alias: string) => void
  confirm: () => Promise<number>
}

export const useImport = create<ImportState>((set, get) => ({
  open: false,
  preview: null,
  selected: {},
  show: async () => {
    set({ open: true, preview: null, selected: {} })
    try {
      const pv = await ImportService.Preview()
      const selected: Record<string, boolean> = {}
      for (const it of pv?.items ?? []) if (!it.skip) selected[it.alias] = true
      set({ preview: pv, selected })
    } catch {
      set({ preview: { path: '', items: [] } })
    }
  },
  close: () => set({ open: false }),
  toggle: (alias) => set((s) => ({ selected: { ...s.selected, [alias]: !s.selected[alias] } })),
  confirm: async () => {
    const aliases = Object.entries(get().selected).filter(([, v]) => v).map(([a]) => a)
    try {
      return await ImportService.Confirm(aliases)
    } catch {
      return 0
    }
  },
}))
