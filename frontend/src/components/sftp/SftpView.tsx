import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'
import { useServers } from '../../stores/servers'
import { envClassOf } from '../../lib/env'
import { joinRemote } from '../../lib/remotePath'
import { LocalPane } from './LocalPane'
import { RemotePane } from './RemotePane'
import { TransferBar } from './TransferBar'
import { ConfirmModal } from './ConfirmModal'
import { PromptModal } from './PromptModal'

type PendingOverwrite = { kind: 'upload' | 'download'; path: string }

function baseName(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}

// SftpView: the dual-pane SFTP shell (Task 8), wired end-to-end here —
// drag upload/download between the two panes (each gated on an overwrite
// check against the DESTINATION pane's current listing), remote
// mkdir/rename/delete, all through inline modals (never window.confirm/
// prompt/alert). TransferBar sits pinned under the grid. Self-guards on the
// store's `open` flag so App.tsx can mount it unconditionally.
export default function SftpView() {
  const open = useSftp((s) => s.open)
  const serverId = useSftp((s) => s.serverId)
  const close = useSftp((s) => s.close)
  const remoteCwd = useSftp((s) => s.remoteCwd)
  const localEntries = useSftp((s) => s.localEntries)
  const remoteEntries = useSftp((s) => s.remoteEntries)
  const upload = useSftp((s) => s.upload)
  const download = useSftp((s) => s.download)
  const mkdir = useSftp((s) => s.mkdir)
  const remove = useSftp((s) => s.remove)
  const rename = useSftp((s) => s.rename)
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))

  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null)
  const [pendingRename, setPendingRename] = useState<FileEntry | null>(null)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  // Any one of the four modals owns Escape while it's open — without this,
  // dismissing an overwrite/delete/rename/mkdir prompt with Escape would
  // also close the whole SFTP view underneath it.
  const modalOpen = !!pendingOverwrite || !!pendingDelete || !!pendingRename || mkdirOpen

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      // isComposing guards against an IME commit keystroke closing the view
      // mid-composition — same reasoning as TunnelsPanel's Escape handler.
      if (e.key === 'Escape' && !e.isComposing && !modalOpen) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close, modalOpen])

  if (!open) return null

  // Dropping onto a pane means "bring the dragged item HERE": the remote
  // pane uploads a dropped local path, the local pane downloads a dropped
  // remote path. Each checks the DESTINATION's current listing for a
  // same-named entry first; if found, the transfer waits on the overwrite
  // modal's Overwrite button instead of running immediately.
  function dropOnRemote(localPath: string) {
    if (remoteEntries.some((e) => e.name === baseName(localPath))) {
      setPendingOverwrite({ kind: 'upload', path: localPath })
    } else {
      void upload(localPath)
    }
  }

  function dropOnLocal(remotePath: string) {
    if (localEntries.some((e) => e.name === baseName(remotePath))) {
      setPendingOverwrite({ kind: 'download', path: remotePath })
    } else {
      void download(remotePath)
    }
  }

  function confirmOverwrite() {
    if (!pendingOverwrite) return
    const { kind, path } = pendingOverwrite
    setPendingOverwrite(null)
    void (kind === 'upload' ? upload(path) : download(path))
  }

  function confirmDelete() {
    if (!pendingDelete) return
    void remove(joinRemote(remoteCwd, pendingDelete.name))
    setPendingDelete(null)
  }

  function submitRename(newName: string) {
    if (!pendingRename) return
    void rename(joinRemote(remoteCwd, pendingRename.name), newName)
    setPendingRename(null)
  }

  function submitMkdir(name: string) {
    void mkdir(name)
    setMkdirOpen(false)
  }

  return (
    // relative: scopes the confirm/prompt modals' `absolute inset-0` to this
    // pane (they cover the dual-pane grid + TransferBar, not the sidebar or
    // title bar) rather than falling through to the viewport.
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg1b">
      <div className="flex h-[42px] shrink-0 items-center gap-[8px] border-b border-border px-[14px]">
        <span className="shrink-0 text-[13px] font-semibold">SFTP</span>
        {server && <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(server.environment)}`} />}
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-textMuted">
          {server?.name ?? serverId ?? ''}
        </span>
        <button
          type="button"
          title="Close"
          onClick={close}
          className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <LocalPane onDropPath={dropOnLocal} />
        <RemotePane
          onDropPath={dropOnRemote}
          onMkdir={() => setMkdirOpen(true)}
          onRename={setPendingRename}
          onDelete={setPendingDelete}
        />
      </div>

      <TransferBar />

      {pendingOverwrite && (
        <ConfirmModal
          title={`"${baseName(pendingOverwrite.path)}" already exists`}
          message="An item with this name already exists in the destination folder. Overwrite it?"
          confirmLabel="Overwrite"
          danger
          onConfirm={confirmOverwrite}
          onCancel={() => setPendingOverwrite(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.name}"?`}
          message={
            pendingDelete.isDir
              ? 'This permanently deletes the folder and everything inside it.'
              : 'This permanently deletes the file.'
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingRename && (
        <PromptModal
          title={`Rename "${pendingRename.name}"`}
          label="New name"
          initialValue={pendingRename.name}
          confirmLabel="Rename"
          onSubmit={submitRename}
          onCancel={() => setPendingRename(null)}
        />
      )}

      {mkdirOpen && (
        <PromptModal
          title="New folder"
          label="Folder name"
          initialValue=""
          confirmLabel="Create"
          onSubmit={submitMkdir}
          onCancel={() => setMkdirOpen(false)}
        />
      )}
    </div>
  )
}
