import { useEffect, useState } from 'react'
import { useSftp } from '../../stores/sftp'
import { joinRemote } from '../../lib/remotePath'
import type { PaneSide } from '../../lib/sftpSelection'
import { FilePane } from './FilePane'
import { TransferBar } from './TransferBar'
import { ConfirmModal } from './ConfirmModal'
import { PromptModal } from './PromptModal'

// Everything below is addressed by bare entry name plus the pane it came from —
// the store's localCwd/remoteCwd resolve the full path. A transfer's SOURCE is
// always the pane the destination is not.
interface PendingOverwrite {
  dest: PaneSide
  names: string[]
}
interface PendingDelete {
  names: string[]
  hasDir: boolean
}

// SftpView: the dual-pane SFTP shell (Task 8) — drag upload/download between
// the two panes (gated on an overwrite check), remote mkdir/rename/delete via
// inline modals (never window.confirm/prompt/alert). Self-guards on the store's
// `open` flag so App.tsx can mount it unconditionally.
//
// The two panes are one component (FilePane); this one owns what needs to see
// both at once: the overwrite check against the destination listing, and the
// modals.
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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingRename, setPendingRename] = useState<string | null>(null)
  const [mkdirOpen, setMkdirOpen] = useState(false)
  // One of the four modals owns Escape while open, else it'd also close the view.
  const modalOpen = !!pendingOverwrite || !!pendingDelete || pendingRename !== null || mkdirOpen

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

  // One call per name: the backend transfers a single path at a time (each gets
  // its own progress row in TransferBar), and a folder goes recursively.
  function startTransfer(dest: PaneSide, names: string[]) {
    for (const name of names) {
      void (dest === 'remote' ? upload(joinRemote(localCwd, name)) : download(joinRemote(remoteCwd, name)))
    }
  }

  // A transfer is checked against the DESTINATION's listing first. Whatever does
  // not collide starts immediately; the collisions wait on one confirm together,
  // so dropping 20 files does not mean 20 dialogs.
  function transferTo(dest: PaneSide, names: string[]) {
    const taken = new Set((dest === 'remote' ? remoteEntries : localEntries).map((e) => e.name))
    const colliding = names.filter((n) => taken.has(n))
    startTransfer(
      dest,
      names.filter((n) => !taken.has(n)),
    )
    if (colliding.length > 0) setPendingOverwrite({ dest, names: colliding })
  }

  function confirmOverwrite() {
    if (!pendingOverwrite) return
    startTransfer(pendingOverwrite.dest, pendingOverwrite.names)
    setPendingOverwrite(null)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    void remove(pendingDelete.names.map((name) => joinRemote(remoteCwd, name)))
    setPendingDelete(null)
  }

  function submitRename(newName: string) {
    if (pendingRename === null) return
    void rename(joinRemote(remoteCwd, pendingRename), newName)
    setPendingRename(null)
  }

  function submitMkdir(name: string) {
    void mkdir(name)
    setMkdirOpen(false)
  }

  const overwriteDest = pendingOverwrite?.dest === 'remote' ? remoteCwd : localCwd

  return (
    // relative: scopes the modals' `absolute inset-0` to this pane, not the viewport.
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg1b">
      {/* No header row here: the SFTP tab in the title-bar strip already carries
          the whole identity — its badge, the server's name, and the × that closes
          the session — exactly like a terminal tab. A second "SFTP ● <server>"
          bar under it said the same thing twice and cost the panes 42px. */}
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
            {/* Rename/Delete/New folder reach only the remote pane — every
                mutating SftpService call takes a session id (see paneMenu.ts). */}
            <FilePane side="local" onTransfer={transferTo} />
            <FilePane
              side="remote"
              onTransfer={transferTo}
              onMkdir={() => setMkdirOpen(true)}
              onRename={setPendingRename}
              onDelete={(names) =>
                setPendingDelete({ names, hasDir: remoteEntries.some((e) => e.isDir && names.includes(e.name)) })
              }
            />
          </div>

          <TransferBar />
        </>
      )}

      {pendingOverwrite && (
        <ConfirmModal
          title={
            pendingOverwrite.names.length === 1
              ? `"${pendingOverwrite.names[0]}" already exists`
              : `${pendingOverwrite.names.length} items already exist`
          }
          message={`${overwriteDest} already contains ${
            pendingOverwrite.names.length === 1 ? 'this name' : pendingOverwrite.names.join(', ')
          }. Overwrite?`}
          confirmLabel="Overwrite"
          danger
          onConfirm={confirmOverwrite}
          onCancel={() => setPendingOverwrite(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={
            pendingDelete.names.length === 1
              ? `Delete "${pendingDelete.names[0]}"?`
              : `Delete ${pendingDelete.names.length} items?`
          }
          message={
            pendingDelete.hasDir
              ? 'This permanently deletes the selection, including everything inside the folders in it.'
              : 'This permanently deletes the selection.'
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingRename !== null && (
        <PromptModal
          title={`Rename "${pendingRename}"`}
          label="New name"
          initialValue={pendingRename}
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
