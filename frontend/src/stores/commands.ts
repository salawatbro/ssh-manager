import { create } from 'zustand'
import { CommandService, type CommandInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { ServerCommand } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { launchErrorMessage } from '../lib/launchErrors'
import { useLock } from './lock'
import { useServers } from './servers'
import { toastError, toastInfo } from './toasts'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface CommandsState {
  byServer: Record<string, ServerCommand[]>
  load: (serverID: string) => Promise<void>
  // null on success, otherwise the backend's message.
  save: (input: CommandInput) => Promise<string | null>
  remove: (c: ServerCommand) => Promise<string | null>
  // Opens the command's server in the terminal and runs it there.
  run: (c: ServerCommand) => Promise<void>
}

export const useCommands = create<CommandsState>((set, get) => ({
  byServer: {},

  load: async (serverID) => {
    try {
      const list = (await CommandService.ListFor(serverID)) ?? []
      set((s) => ({ byServer: { ...s.byServer, [serverID]: list } }))
    } catch {
      set((s) => ({ byServer: { ...s.byServer, [serverID]: s.byServer[serverID] ?? [] } }))
    }
  },

  save: async (input) => {
    try {
      const saved = await CommandService.Save(input)
      if (saved) await get().load(saved.serverId)
      return null
    } catch (e) {
      return message(e)
    }
  },

  remove: async (c) => {
    try {
      await CommandService.Delete(c.id)
      await get().load(c.serverId)
      return null
    } catch (e) {
      return message(e)
    }
  },

  run: async (c) => {
    if (useLock.getState().locked) return
    try {
      const res = await CommandService.Run(c.id, false)
      if (res?.note) toastInfo(res.note)
      void useServers.getState().load()
    } catch (e) {
      toastError(launchErrorMessage(e))
    }
  },
}))
