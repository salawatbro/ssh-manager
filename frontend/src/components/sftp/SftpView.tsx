import { useEffect, useState } from 'react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'
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

// Local paths are always POSIX on this app's macOS-only target (mirrors
// FileRow's joinPath / LocalPane's parentOf) — used to build the full path
// for a local entry the remote pane's Upload menu item fires on.
function joinLocal(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`
}

// SftpView: the dual-pane SFTP shell (Task 8) — drag upload/download between
// the two panes (gated on an overwrite check), remote mkdir/rename/delete
// via inline modals (never window.confirm/prompt/alert). Self-guards on the
// store's `open` flag so App.tsx can mount it unconditionally.
export default function SftpView() {
  const open = useSftp((s) => s.open)
  // While a terminal tab is frontmost this view stays mounted but hidden
  // (MainContent), so Escape must NOT reach it — it would close the SFTP
  // session from under a user who is typing in the terminal.
  const active = useSftp((s) => s.active)
  const connecting = useSftp((s) => s.connecting)
  const error = useSftp((s) => s.error)
  const sessionId = useSftp((s) => s.sessionId)
  const close = useSftp((s) => s.close)
  const remoteCwd = useSftp((s) => s.remoteCwd)
  const localCwd = useSftp((s) => s.localCwd)
  const localEntries = useSftp((s) => s.localEntries)
  const remoteEntries = useSftp((s) => s.remoteEntries)
  const upload = useSftp((s) => s.upload)
  const download = useSftp((s) => s.download)
  const mkdir = useSftp((s) => s.mkdir)
  const remove = useSftp((s) => s.remove)
  const rename = useSftp((s) => s.rename)

  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null)
  const [pendingRename, setPendingRename] = useState<FileEntry | null>(null)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  // One of the four modals owns Escape while open, else it'd also close the view.
  const modalOpen = !!pendingOverwrite || !!pendingDelete || !!pendingRename || mkdirOpen

  useEffect(() => {
    if (!open || !active) return
    function onKeyDown(e: KeyboardEvent) {
      // isComposing guards against an IME commit keystroke closing the view.
      if (e.key === 'Escape' && !e.isComposing && !modalOpen) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, active, close, modalOpen])

  if (!open) return null

  // Dropping onto a pane means "bring the dragged item HERE"; each checks the
  // DESTINATION's listing first and waits on the overwrite modal if it collides.
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
    // relative: scopes the modals' `absolute inset-0` to this pane, not the viewport.
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg1b">
      {/* No header row here: the SFTP tab in the title-bar strip already carries
          the whole identity — its icon, the server's name, the environment
          border, and the × that closes the session — exactly like a terminal
          tab. A second "SFTP ● <server>" bar under it said the same thing twice
          and cost the panes 42px. */}
      {connecting ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-textMuted">
          Connecting to the server…
        </div>
      ) : !sessionId ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[10px] px-[24px] text-center">
          <span className="text-[13.5px] font-semibold text-text">Could not connect</span>
          {error && <span className="max-w-[360px] text-[12.5px] text-textMuted">{error}</span>}
          <button type="button" onClick={close} className="no-drag mt-[4px] h-[28px] rounded-[6px] border border-border px-[14px] text-[12.5px] font-medium text-text hover:bg-bg2">
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            <LocalPane onDropPath={dropOnLocal} onUpload={(entry) => dropOnRemote(joinLocal(localCwd, entry.name))} />
            <RemotePane
              onDropPath={dropOnRemote}
              onDownload={(entry) => dropOnLocal(joinRemote(remoteCwd, entry.name))}
              onMkdir={() => setMkdirOpen(true)}
              onRename={setPendingRename}
              onDelete={setPendingDelete}
            />
          </div>

          <TransferBar />
        </>
      )}

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
