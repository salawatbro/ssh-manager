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
  side: PaneSide
  names: string[]
  hasDir: boolean
}
// The three PromptModal cases share one state; only rename carries a name.
type Prompt =
  | { kind: 'mkdir'; side: PaneSide }
  | { kind: 'newfile'; side: PaneSide }
  | { kind: 'rename'; side: PaneSide; name: string }

// SftpView: the dual-pane SFTP shell — drag upload/download between the two
// panes (gated on an overwrite check) and per-pane mkdir/new-file/rename/delete
// via inline modals (never window.confirm/prompt/alert). Both panes are full
// file managers now: the mutations dispatch to the remote session or the local
// filesystem in stores/sftpMutations.ts. Self-guards on the store's `open` flag.
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
  const requestClose = useSftp((s) => s.requestClose)
  const pendingClose = useSftp((s) => s.pendingClose)
  const mkdir = useSftp((s) => s.mkdir)
  const createFile = useSftp((s) => s.createFile)
  const remove = useSftp((s) => s.remove)
  const rename = useSftp((s) => s.rename)

  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  // One of the modals — or the close confirm (App-level CloseSessionModal) —
  // owns Escape while open, else it'd also close the view.
  const modalOpen = !!pendingOverwrite || !!pendingDelete || prompt !== null || pendingClose

  useEffect(() => {
    if (!open || !active) return
    function onKeyDown(e: KeyboardEvent) {
      // isComposing guards against an IME commit keystroke closing the view.
      // requestClose confirms first when the setting is on, else closes now.
      if (e.key === 'Escape' && !e.isComposing && !modalOpen) requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, active, requestClose, modalOpen])

  if (!open) return null

  const cwdFor = (side: PaneSide) => (side === 'remote' ? remoteCwd : localCwd)
  const entriesFor = (side: PaneSide) => (side === 'remote' ? remoteEntries : localEntries)

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
    const taken = new Set(entriesFor(dest).map((e) => e.name))
    startTransfer(
      dest,
      names.filter((n) => !taken.has(n)),
    )
    const colliding = names.filter((n) => taken.has(n))
    if (colliding.length > 0) setPendingOverwrite({ dest, names: colliding })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const { side, names } = pendingDelete
    void remove(
      side,
      names.map((n) => joinRemote(cwdFor(side), n)),
    )
    setPendingDelete(null)
  }

  function submitPrompt(value: string) {
    if (!prompt) return
    if (prompt.kind === 'mkdir') void mkdir(prompt.side, value)
    else if (prompt.kind === 'newfile') void createFile(prompt.side, value)
    else void rename(prompt.side, joinRemote(cwdFor(prompt.side), prompt.name), value)
    setPrompt(null)
  }

  // The full handler set for one pane; both panes get the same, differing only
  // in the side each closes over.
  const paneProps = (side: PaneSide) => ({
    side,
    onTransfer: transferTo,
    onMkdir: () => setPrompt({ kind: 'mkdir', side }),
    onNewFile: () => setPrompt({ kind: 'newfile', side }),
    onRename: (name: string) => setPrompt({ kind: 'rename', side, name }),
    onDelete: (names: string[]) =>
      setPendingDelete({ side, names, hasDir: entriesFor(side).some((e) => e.isDir && names.includes(e.name)) }),
  })

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
            <FilePane {...paneProps('local')} />
            <FilePane {...paneProps('remote')} />
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
          onConfirm={() => {
            startTransfer(pendingOverwrite.dest, pendingOverwrite.names)
            setPendingOverwrite(null)
          }}
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

      {prompt && (
        <PromptModal
          title={prompt.kind === 'rename' ? `Rename "${prompt.name}"` : prompt.kind === 'newfile' ? 'New file' : 'New folder'}
          label={prompt.kind === 'rename' ? 'New name' : prompt.kind === 'newfile' ? 'File name' : 'Folder name'}
          initialValue={prompt.kind === 'rename' ? prompt.name : ''}
          confirmLabel={prompt.kind === 'rename' ? 'Rename' : 'Create'}
          onSubmit={submitPrompt}
          onCancel={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
