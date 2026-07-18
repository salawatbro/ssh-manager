import { useEffect, useState, type DragEvent } from 'react'
import { CornerLeftUp } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'
import { dirnameRemote, joinRemote } from '../../lib/remotePath'
import { FileRow } from './FileRow'
import { Toolbar } from './Toolbar'

interface Props {
  // Forwarded straight into Toolbar — SftpView supplies the mkdir/rename
  // prompts and the delete confirm and passes them down when it mounts this.
  onMkdir?: () => void
  onRename?: (entry: FileEntry) => void
  onDelete?: (entry: FileEntry) => void
  // Fired with the FULL path dragged in from the local pane (FileRow puts it
  // in the text/plain payload) — SftpView turns this into an upload, after
  // its own overwrite check against remoteEntries.
  onDropPath?: (fullPath: string) => void
}

// Right pane of SftpView: the remote filesystem over the open SFTP session.
// Same shape as LocalPane (header + Toolbar + list) but wired to
// remoteCwd/remoteEntries/navRemote, and the only pane whose Toolbar has
// +Folder/Rename/Delete. The whole pane is the upload drop target — dropping
// a local item here means "upload it into remoteCwd".
export function RemotePane({ onMkdir, onRename, onDelete, onDropPath }: Props) {
  const cwd = useSftp((s) => s.remoteCwd)
  const entries = useSftp((s) => s.remoteEntries)
  const navRemote = useSftp((s) => s.navRemote)
  const [selected, setSelected] = useState<FileEntry | null>(null)

  // Same reasoning as LocalPane: never carry a selection across a directory
  // change — Rename/Delete would otherwise silently target a stale entry.
  useEffect(() => {
    setSelected(null)
  }, [cwd])

  function open(entry: FileEntry) {
    void navRemote(joinRemote(cwd, entry.name))
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const path = e.dataTransfer.getData('text/plain')
    if (path) onDropPath?.(path)
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg1"
    >
      <div className="flex h-[34px] shrink-0 items-center gap-[6px] border-b border-border px-[10px]">
        <button
          type="button"
          title="Parent directory"
          onClick={() => void navRemote(dirnameRemote(cwd))}
          disabled={cwd === '/'}
          className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text disabled:opacity-40"
        >
          <CornerLeftUp size={13} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-textMuted">{cwd}</span>
      </div>
      <Toolbar variant="remote" selected={selected} onMkdir={onMkdir} onRename={onRename} onDelete={onDelete} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-[10px] py-[8px] text-[11.5px] text-textDim">Empty directory.</div>
        ) : (
          entries.map((entry) => (
            <FileRow
              key={entry.name}
              entry={entry}
              basePath={cwd}
              selected={selected?.name === entry.name}
              onSelect={setSelected}
              onOpen={open}
            />
          ))
        )}
      </div>
    </div>
  )
}
