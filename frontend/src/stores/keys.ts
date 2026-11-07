import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { AgentStatus, GenerateKeyInput, ImportKeyInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { toastError } from './toasts'

// The agent's stored keys and live status. Every action returns the backend's
// message on failure (or null) so modals can show it inline.

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface KeysState {
  keys: AgentKey[]
  status: AgentStatus | null
  selectedId: string | null
  // The key whose sheet is open on the Keys page.
  sheetId: string | null
  refresh: () => Promise<void>
  select: (id: string | null) => void
  openSheet: (id: string | null) => void
  generate: (input: GenerateKeyInput) => Promise<AgentKey | string>
  importKey: (input: ImportKeyInput) => Promise<AgentKey | string>
  rename: (id: string, name: string) => Promise<string | null>
  setRequireConfirm: (id: string, require: boolean) => Promise<void>
  remove: (id: string) => Promise<string | null>
  listen: () => () => void
}

export const useKeys = create<KeysState>((set, get) => {
  // Adds or replaces one key, keeping the list in name order like the backend.
  const upsert = (k: AgentKey) =>
    set((s) => ({
      keys: [...s.keys.filter((x) => x.id !== k.id), k].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    }))

  return {
    keys: [],
    status: null,
    selectedId: null,
    sheetId: null,

    refresh: async () => {
      try {
        const [keys, status] = await Promise.all([AgentService.ListKeys(), AgentService.Status()])
        const list = keys ?? []
        const sel = get().selectedId
        set({ keys: list, status, selectedId: list.some((k) => k.id === sel) ? sel : (list[0]?.id ?? null) })
      } catch (e) {
        toastError(msg(e))
      }
    },

    select: (id) => set({ selectedId: id }),
    openSheet: (id) => set({ sheetId: id }),

    generate: async (input) => {
      try {
        const k = await AgentService.Generate(input)
        if (!k) return 'The key was not created.'
        upsert(k)
        set({ selectedId: k.id })
        return k
      } catch (e) {
        return msg(e)
      }
    },

    importKey: async (input) => {
      try {
        const k = await AgentService.Import(input)
        if (!k) return 'The key was not imported.'
        upsert(k)
        set({ selectedId: k.id })
        return k
      } catch (e) {
        return msg(e)
      }
    },

    rename: async (id, name) => {
      try {
        const k = await AgentService.Rename(id, name)
        if (k) upsert(k)
        return null
      } catch (e) {
        return msg(e)
      }
    },

    setRequireConfirm: async (id, require) => {
      try {
        const k = await AgentService.SetRequireConfirm(id, require)
        if (k) upsert(k)
      } catch (e) {
        toastError(msg(e))
      }
    },

    remove: async (id) => {
      try {
        await AgentService.Delete(id)
        const keys = get().keys.filter((k) => k.id !== id)
        set({ keys, selectedId: get().selectedId === id ? (keys[0]?.id ?? null) : get().selectedId })
        return null
      } catch (e) {
        return msg(e)
      }
    },

    // agent:status fires on start/stop, ssh-add -x/-X and temporary-key
    // changes. Wired once at app mount.
    listen: () =>
      Events.On('agent:status', (ev) => {
        set({ status: ev.data as AgentStatus })
      }),
  }
})
