import { create } from 'zustand'
import { SettingsService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { toastError } from './toasts'

export type SettingsSection = 'general' | 'terminal' | 'shortcuts' | 'data' | 'snippets' | 'about'

interface SettingsState {
  settings: Settings | null
  open: boolean
  section: SettingsSection
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
  show: () => void
  close: () => void
  setSection: (s: SettingsSection) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  open: false,
  section: 'general',

  load: async () => {
    try {
      set({ settings: await SettingsService.Get() })
    } catch {
      // leave null; the modal shows a loading state
    }
  },

  // Optimistic: apply the patch locally, then persist. The backend sanitises
  // and returns the authoritative object, which we adopt (clamped values snap).
  update: async (patch) => {
    const cur = get().settings
    if (!cur) return
    const next = { ...cur, ...patch }
    set({ settings: next })
    try {
      const saved = await SettingsService.Update(next)
      set({ settings: saved })
    } catch (e) {
      // Revert the optimistic patch AND say so — a control silently snapping
      // back reads as a UI glitch, not as a failed save.
      set({ settings: cur })
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  show: () => {
    void get().load()
    set({ open: true })
  },
  close: () => set({ open: false }),
  setSection: (section) => set({ section }),
}))
