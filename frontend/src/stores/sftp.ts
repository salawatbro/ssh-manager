import { create } from 'zustand'
import { SftpService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { joinRemote, dirnameRemote } from '../lib/remotePath'
import { toastError } from './toasts'

// Mirrors the sftp:progress event payload (service/models.ts SftpProgress)
// minus the terminal-only `finished`/`error` fields (see applyProgress).
export interface TransferProgress {
  transferID: string
  direction: string
  currentFile: string
  done: number
  total: number
}

interface SftpState {
  open: boolean
  connecting: boolean
  serverId: string | null
  sessionId: string | null
  localCwd: string
  remoteCwd: string
  localEntries: FileEntry[]
  remoteEntries: FileEntry[]
  transfers: TransferProgress[]
  // Connect-time failure only — SftpView renders it on the pre-connect
  // screen. Errors after connect (nav, transfer, mkdir/remove/rename) have no
  // inline surface there and go through toasts instead.
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
  connecting: false,
  serverId: null,
  sessionId: null,
  localCwd: '',
  remoteCwd: '',
  localEntries: [],
  remoteEntries: [],
  transfers: [],
  error: null,

  openFor: async (server) => {
    // Close any prior session (fire-and-forget) so re-opening doesn't leak it.
    const prev = get().sessionId
    if (prev) void SftpService.Close(prev).catch(() => {})
    // Show the panel right away in a connecting state (worse with 2FA prompts).
    set({
      open: true, connecting: true, error: null, serverId: server.id,
      sessionId: null, localCwd: '', remoteCwd: '', localEntries: [], remoteEntries: [],
    })
    try {
      const sessionId = await SftpService.Open(server.id)
      const [localCwd, remoteCwd] = await Promise.all([SftpService.LocalHome(), SftpService.RemoteHome(sessionId)])
      const [localEntries, remoteEntries] = await Promise.all([
        SftpService.ListLocal(localCwd),
        SftpService.ListRemote(sessionId, remoteCwd),
      ])
      set({
        connecting: false,
        sessionId,
        localCwd,
        remoteCwd,
        localEntries: localEntries ?? [],
        remoteEntries: remoteEntries ?? [],
      })
    } catch (e) {
      // Keep open:true so SftpView renders the error; sessionId stays null.
      set({ connecting: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  // Fire-and-forget: the panel is gone by the time this settles (mirrors copySSHCommand).
  close: () => {
    const { sessionId } = get()
    if (sessionId) void SftpService.Close(sessionId).catch(() => {})
    set({
      open: false,
      connecting: false,
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
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  navRemote: async (dir) => {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      const entries = (await SftpService.ListRemote(sessionId, dir)) ?? []
      set({ remoteCwd: dir, remoteEntries: entries })
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  refresh: async () => {
    const { localCwd, remoteCwd } = get()
    await Promise.all([get().navLocal(localCwd), get().navRemote(remoteCwd)])
  },

  // Tracked via sftp:progress (applyProgress); the backend copies in a goroutine.
  upload: async (localPath) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Upload(sessionId, localPath, remoteCwd)
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  download: async (remotePath) => {
    const { sessionId, localCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Download(sessionId, remotePath, localCwd)
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
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
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  remove: async (path) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Remove(sessionId, path)
      await get().navRemote(remoteCwd)
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  rename: async (oldPath, newName) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      await SftpService.Rename(sessionId, oldPath, joinRemote(dirnameRemote(oldPath), newName))
      await get().navRemote(remoteCwd)
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
  },

  applyProgress: (p) => {
    // A transfer that dies mid-flight reports through its progress event; the
    // panel is past the pre-connect screen by then, so toast it.
    if (p.error) toastError(p.error)
    set((state) => ({
      transfers: p.finished
        ? state.transfers.filter((t) => t.transferID !== p.transferID)
        : [
            ...state.transfers.filter((t) => t.transferID !== p.transferID),
            { transferID: p.transferID, direction: p.direction, currentFile: p.currentFile, done: p.done, total: p.total },
          ],
    }))
    // A finished transfer may leave a partial file — refresh both panels.
    if (p.finished) void get().refresh()
  },
}))
