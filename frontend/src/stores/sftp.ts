import { create } from 'zustand'
import { SftpService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { joinRemote, dirnameRemote } from '../lib/remotePath'

// Mirrors the sftp:progress event payload (service/models.ts SftpProgress)
// minus the terminal-only `finished`/`error` fields, which applyProgress
// takes separately — a finished transfer is removed from `transfers`
// rather than kept around with those fields set.
export interface TransferProgress {
  transferID: string
  direction: string
  currentFile: string
  done: number
  total: number
}

interface SftpState {
  open: boolean
  serverId: string | null
  sessionId: string | null
  localCwd: string
  remoteCwd: string
  localEntries: FileEntry[]
  remoteEntries: FileEntry[]
  transfers: TransferProgress[]
  error: string | null

  openFor: (server: Server) => Promise<void>
  close: () => void
  navLocal: (dir: string) => Promise<void>
  navRemote: (dir: string) => Promise<void>
  refresh: () => Promise<void>
  upload: (localPath: string) => Promise<void>
  download: (remotePath: string) => Promise<void>
  cancel: (transferID: string) => void
  mkdir: (name: string) => Promise<void>
  remove: (path: string) => Promise<void>
  rename: (oldPath: string, newName: string) => Promise<void>
  // internal, used by useSftpProgress:
  applyProgress: (p: TransferProgress & { finished: boolean; error: string }) => void
}

export const useSftp = create<SftpState>((set, get) => ({
  open: false,
  serverId: null,
  sessionId: null,
  localCwd: '',
  remoteCwd: '',
  localEntries: [],
  remoteEntries: [],
  transfers: [],
  error: null,

  openFor: async (server) => {
    set({ error: null })
    // Close any already-open session first (fire-and-forget) so re-opening the
    // browser doesn't leak the previous backend SFTP channel + SSH connection.
    const prev = get().sessionId
    if (prev) void SftpService.Close(prev).catch(() => {})
    try {
      const sessionId = await SftpService.Open(server.id)
      const [localCwd, remoteCwd] = await Promise.all([SftpService.LocalHome(), SftpService.RemoteHome(sessionId)])
      const [localEntries, remoteEntries] = await Promise.all([
        SftpService.ListLocal(localCwd),
        SftpService.ListRemote(sessionId, remoteCwd),
      ])
      set({
        open: true,
        serverId: server.id,
        sessionId,
        localCwd,
        remoteCwd,
        localEntries: localEntries ?? [],
        remoteEntries: remoteEntries ?? [],
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  // Fire-and-forget: the panel is already gone by the time this settles, so
  // there is nothing left to update on failure (mirrors copySSHCommand).
  close: () => {
    const { sessionId } = get()
    if (sessionId) void SftpService.Close(sessionId).catch(() => {})
    set({
      open: false,
      serverId: null,
      sessionId: null,
      localCwd: '',
      remoteCwd: '',
      localEntries: [],
      remoteEntries: [],
      transfers: [],
      error: null,
    })
  },

  navLocal: async (dir) => {
    try {
      const entries = (await SftpService.ListLocal(dir)) ?? []
      set({ localCwd: dir, localEntries: entries })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  navRemote: async (dir) => {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      const entries = (await SftpService.ListRemote(sessionId, dir)) ?? []
      set({ remoteCwd: dir, remoteEntries: entries })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  refresh: async () => {
    const { localCwd, remoteCwd } = get()
    await Promise.all([get().navLocal(localCwd), get().navRemote(remoteCwd)])
  },

  // The transfer itself is tracked via sftp:progress (applyProgress), not the
  // returned transferID here — the backend starts the copy in a goroutine and
  // returns immediately.
  upload: async (localPath) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Upload(sessionId, localPath, remoteCwd)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  download: async (remotePath) => {
    const { sessionId, localCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Download(sessionId, remotePath, localCwd)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  cancel: (transferID) => {
    void SftpService.CancelTransfer(transferID).catch(() => {})
  },

  mkdir: async (name) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Mkdir(sessionId, joinRemote(remoteCwd, name))
      await get().navRemote(remoteCwd)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  remove: async (path) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Remove(sessionId, path)
      await get().navRemote(remoteCwd)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  rename: async (oldPath, newName) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Rename(sessionId, oldPath, joinRemote(dirnameRemote(oldPath), newName))
      await get().navRemote(remoteCwd)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  applyProgress: (p) => {
    set((state) => ({
      transfers: p.finished
        ? state.transfers.filter((t) => t.transferID !== p.transferID)
        : [
            ...state.transfers.filter((t) => t.transferID !== p.transferID),
            { transferID: p.transferID, direction: p.direction, currentFile: p.currentFile, done: p.done, total: p.total },
          ],
      error: p.error || state.error,
    }))
    // A finished transfer (success or failure) may have added/left a partial
    // file — refresh both panels so whichever side changed reflects it.
    if (p.finished) void get().refresh()
  },
}))
