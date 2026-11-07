import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { StackService, type StackInput, type StackLaunch } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { launchErrorMessage } from '../lib/launchErrors'
import { withTunnel } from '../lib/stackDraft'
import { launchText } from '../lib/stacks'
import { useLock } from './lock'
import { toastError, toastInfo, toastSuccess } from './toasts'

const message = (e: unknown) => launchErrorMessage(e)

interface StacksState {
  stacks: Stack[]
  selectedId: string | null
  // The stack whose launch is under way, so its button can wait.
  launchingId: string | null

  load: () => Promise<void>
  select: (id: string | null) => void
  // The saved stack, or the backend's message.
  create: (input: StackInput) => Promise<Stack | string>
  update: (id: string, input: StackInput) => Promise<Stack | string>
  remove: (id: string) => Promise<string | null>
  launch: (id: string) => Promise<void>
  // Moves a tunnel out of the stack `from` and into `to` ('' = none).
  placeTunnel: (forwardId: string, to: string, from: string) => Promise<string | null>
  // stack:launched reports launches from the tray and global shortcuts.
  listen: () => () => void
}

function report(res: StackLaunch) {
  toastSuccess(launchText(res))
  if (res.note) toastInfo(res.note)
}

export const useStacks = create<StacksState>((set, get) => ({
  stacks: [],
  selectedId: null,
  launchingId: null,

  load: async () => {
    try {
      const stacks = (await StackService.List()) ?? []
      const sel = get().selectedId
      set({ stacks, selectedId: stacks.some((s) => s.id === sel) ? sel : (stacks[0]?.id ?? null) })
    } catch {
      set({ stacks: [] })
    }
  },

  select: (id) => set({ selectedId: id }),

  create: async (input) => {
    try {
      const st = await StackService.Create(input)
      await get().load()
      if (st) set({ selectedId: st.id })
      return st ?? 'The stack was not saved.'
    } catch (e) {
      return message(e)
    }
  },

  update: async (id, input) => {
    try {
      const st = await StackService.Update(id, input)
      await get().load()
      return st ?? 'The stack was not saved.'
    } catch (e) {
      return message(e)
    }
  },

  remove: async (id) => {
    try {
      await StackService.Delete(id)
      await get().load()
      return null
    } catch (e) {
      return message(e)
    }
  },

  launch: async (id) => {
    if (useLock.getState().locked || get().launchingId) return
    set({ launchingId: id })
    try {
      report(await StackService.Launch(id))
    } catch (e) {
      toastError(message(e))
    } finally {
      set({ launchingId: null })
      void get().load()
    }
  },

  placeTunnel: async (forwardId, to, from) => {
    if (to === from) return null
    const moves: [string, boolean][] = [
      [from, false],
      [to, true],
    ]
    try {
      for (const [id, on] of moves) {
        const st = get().stacks.find((s) => s.id === id)
        if (st) await StackService.Update(st.id, withTunnel(st, forwardId, on))
      }
      return null
    } catch (e) {
      return message(e)
    } finally {
      await get().load()
    }
  },

  listen: () =>
    Events.On('stack:launched', (ev) => {
      if (ev.data.error) toastError(ev.data.error)
      else report(ev.data.result)
      void get().load()
    }),
}))
