import { useEffect, useState, type DragEvent } from 'react'
import { CornerLeftUp } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'
import { FileRow } from './FileRow'
import { Toolbar } from './Toolbar'

interface Props {
  // Fired with the FULL path dragged in from the remote pane — SftpView
  // turns this into a download, after its own overwrite check against
  // localEntries.
  onDropPath?: (fullPath: string) => void
}

// Local paths are always POSIX on this app's macOS-only target, so a plain
// slash split is enough for the ".." parent. Kept separate from
// lib/remotePath.ts's dirnameRemote (same shape) since that one is named,
// and documented, for the remote side specifically.
function parentOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : '/'
}

// Left pane of SftpView: the local filesystem. Header (cwd + ".." button),
// Toolbar, entry list — reads localCwd/localEntries from the store and
// drives navigation via navLocal. The whole pane is the download drop
// target — dropping a remote item here means "download it into localCwd".
export function LocalPane({ onDropPath }: Props) {
  const cwd = useSftp((s) => s.localCwd)
  const entries = useSftp((s) => s.localEntries)
  const navLocal = useSftp((s) => s.navLocal)
  const [selected, setSelected] = useState<FileEntry | null>(null)

  // A stale selection pointing at an entry from the PREVIOUS directory would
  // silently arm Rename/Delete for something no longer listed.
  useEffect(() => {
    setSelected(null)
  }, [cwd])

  function open(entry: FileEntry) {
    void navLocal(cwd.endsWith('/') ? `${cwd}${entry.name}` : `${cwd}/${entry.name}`)
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
      className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-bg1"
    >
      <div className="flex h-[34px] shrink-0 items-center gap-[6px] border-b border-border px-[10px]">
        <button
          type="button"
          title="Parent directory"
          onClick={() => void navLocal(parentOf(cwd))}
          disabled={cwd === '/' || cwd === ''}
          className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text disabled:opacity-40"
        >
          <CornerLeftUp size={13} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-textMuted">{cwd}</span>
      </div>
      <Toolbar variant="local" selected={selected} />
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
