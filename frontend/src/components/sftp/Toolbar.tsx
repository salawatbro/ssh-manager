import { FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'

interface Props {
  variant: 'local' | 'remote'
  selected: FileEntry | null
  // New folder/Rename/Delete all need UI beyond a single click (a name
  // prompt or a confirm) — window.prompt/confirm are banned, so Task 9 owns
  // that UI in SftpView and these buttons just forward to it.
  onMkdir?: () => void
  onRename?: (entry: FileEntry) => void
  onDelete?: (entry: FileEntry) => void
}

const iconButton =
  'flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-textDim'

// Panel action bar for one pane (local or remote). Refresh needs no
// confirmation or input, so it calls the store directly; New folder/Rename/
// Delete are deferred to whatever prompt/confirm UI the caller wires up (see
// onMkdir/onRename/onDelete above).
export function Toolbar({ variant, selected, onMkdir, onRename, onDelete }: Props) {
  function refresh() {
    void useSftp.getState().refresh()
  }

  return (
    <div className="flex h-[28px] shrink-0 items-center gap-[2px] border-b border-border px-[8px]">
      <button type="button" title="Refresh" onClick={refresh} className={iconButton}>
        <RefreshCw size={13} />
      </button>
      {variant === 'remote' && (
        <>
          <button type="button" title="New folder" onClick={() => onMkdir?.()} className={iconButton}>
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
