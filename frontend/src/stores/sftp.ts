import { create } from 'zustand'
import { SftpService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { joinRemote, dirnameRemote } from '../lib/remotePath'
import { toastError } from './toasts'
import { releaseContentArea } from './view'
import { clearPaneSelection } from './sftpSelection'

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
  // Frontmost-view flag. `open` is the session's lifetime; `active` is whether
  // the SFTP tab is the one being shown. The two are separate so selecting a
  // terminal tab can hide SFTP without closing its connection (MainContent
  // keeps both mounted — see lib/mainView.ts).
  active: boolean
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
  // Show / hide the SFTP tab without ending its session. blur() is called by
  // every sessions-store action that brings a terminal tab forward.
  focus: () => void
  blur: () => void
  navLocal: (dir: string) => Promise<void>
  navRemote: (dir: string) => Promise<void>
  refresh: () => Promise<void>
  upload: (localPath: string) => Promise<void>
  download: (remotePath: string) => Promise<void>
  cancel: (transferID: string) => void
  mkdir: (name: string) => Promise<void>
  // Takes a list: the panes support a multi-selection, and the backend has no
  // batch delete.
  remove: (paths: string[]) => Promise<void>
  rename: (oldPath: string, newName: string) => Promise<void>
  // internal, used by useSftpProgress:
  applyProgress: (p: TransferProgress & { finished: boolean; error: string }) => void
}

export const useSftp = create<SftpState>((set, get) => ({
  open: false,
  active: false,
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
      open: true, active: true, connecting: true, error: null, serverId: server.id,
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
    // Otherwise the next session opens with the last one's selection still in it.
    clearPaneSelection('local')
    clearPaneSelection('remote')
    set({
      open: false,
      active: false,
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

  // No-ops when no session is open, so a stray click can't focus an empty view.
  focus: () => {
    // Same choke point as sessions.ts's focusTerminals: the explicitly-opened
    // detail page / editor share this slot and must let go when SFTP is raised.
    releaseContentArea()
    set((s) => (s.open ? { active: true } : {}))
  },
  blur: () => set({ active: false }),

  navLocal: async (dir) => {
    try {
      const entries = (await SftpService.ListLocal(dir)) ?? []
      // Selected names mean nothing in a different folder — but a refresh of the
      // SAME folder must keep the selection (every finished transfer refreshes
      // both panes, and the user may still be picking files).
      if (dir !== get().localCwd) clearPaneSelection('local')
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
      if (dir !== get().remoteCwd) clearPaneSelection('remote')
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

  // One Remove per path, then a single refresh at the end instead of one per
  // file. A failure stops the run (the rest of the selection is left alone) and
  // still refreshes, so the pane shows exactly what survived.
  remove: async (paths) => {
    const { sessionId, remoteCwd } = get()
    if (!sessionId) return
    try {
      for (const path of paths) {
        await SftpService.Remove(sessionId, path)
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e))
    }
    await get().navRemote(remoteCwd)
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
