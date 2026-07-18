import { FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'

interface Props {
  variant: 'local' | 'remote'
  selected: FileEntry | null
  // Rename/Delete act on `selected` but the actual prompt/confirm UI is
  // Task 9's job — these buttons just forward to whatever it wires up.
  onRename?: (entry: FileEntry) => void
  onDelete?: (entry: FileEntry) => void
}

const iconButton =
  'flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-textDim'

// Panel action bar for one pane (local or remote). Refresh and "+ Folder"
// are neither destructive nor need any input beyond a name, so they call
// the store directly — mirrors the brief's "call store actions directly
// where trivial" carve-out. Rename/Delete are deferred (see onRename/onDelete
// above).
export function Toolbar({ variant, selected, onRename, onDelete }: Props) {
  function refresh() {
    void useSftp.getState().refresh()
  }

  function mkdir() {
    const name = window.prompt('New folder name')
    if (name) void useSftp.getState().mkdir(name)
  }

  return (
    <div className="flex h-[28px] shrink-0 items-center gap-[2px] border-b border-border px-[8px]">
      <button type="button" title="Refresh" onClick={refresh} className={iconButton}>
        <RefreshCw size={13} />
      </button>
      {variant === 'remote' && (
        <>
          <button type="button" title="New folder" onClick={mkdir} className={iconButton}>
            <FolderPlus size={13} />
          </button>
          <button
            type="button"
            title="Rename"
            disabled={!selected}
            onClick={() => selected && onRename?.(selected)}
            className={iconButton}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            title="Delete"
            disabled={!selected}
            onClick={() => selected && onDelete?.(selected)}
            className={`${iconButton} hover:text-stFailed`}
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
}
