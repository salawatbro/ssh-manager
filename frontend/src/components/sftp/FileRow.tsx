import type { DragEvent } from 'react'
import { File, Folder } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'

interface Props {
  entry: FileEntry
  // The directory this entry lives in — joined with entry.name to build the
  // full path for both the drag payload and the double-click open.
  basePath: string
  selected: boolean
  onSelect: (entry: FileEntry) => void
  // Called for a folder's double-click only (FileRow itself gates on isDir,
  // so callers never have to re-check it).
  onOpen: (entry: FileEntry) => void
  // Right-click on this row — the pane opens a row-specific menu at (x, y).
  onContextMenu?: (entry: FileEntry, x: number, y: number) => void
}

function joinPath(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

// modTime is a Go time.Time marshaled as RFC3339 — an invalid/empty string
// (should not happen, but the field crosses a Wails binding boundary) falls
// back to blank rather than rendering "Invalid Date".
function formatModTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// One directory entry, local or remote (the same row shape serves both
// panes — only basePath and what onOpen/onSelect do differs).
//
// Redesign (Zish.dc.html SFTP panes): 24px inset rows, the name in mono, and
// directories in accentFg so the tree structure reads at a glance while files
// stay plain text. The permission string left the row with it — at this density
// `mode` pushed the date column around for something a user reads rarely, so it
// moved into the row's tooltip alongside the full path. Nothing is lost, and the
// date finally has a fixed column of its own.
export function FileRow({ entry, basePath, selected, onSelect, onOpen, onContextMenu }: Props) {
  const fullPath = joinPath(basePath, entry.name)

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    // Task 9 wires the drop side (upload/download) off this payload.
    e.dataTransfer.setData('text/plain', fullPath)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onSelect(entry)}
      onDoubleClick={() => entry.isDir && onOpen(entry)}
      onContextMenu={(e) => {
        e.preventDefault()
        // Stops the pane's background handler from ALSO firing for this
        // click — a row right-click opens the row menu, not the empty-space one.
        e.stopPropagation()
        onSelect(entry)
        onContextMenu?.(entry, e.clientX, e.clientY)
      }}
      title={`${fullPath}\n${entry.mode}`}
      className={`ml-[6px] mr-[4px] flex h-[24px] shrink-0 cursor-default items-center gap-[8px] rounded-[4px] px-[7px] ${
        selected ? 'bg-bgSel' : 'hover:bg-bgSel'
      }`}
    >
      <span className="flex w-[13px] shrink-0 items-center justify-center">
        {entry.isDir ? (
          // Filled, in the accent: a directory is the thing you steer by in a
          // file pane, so it carries the colour and the solid shape.
          <Folder size={13} className="text-accentFg" fill="currentColor" strokeWidth={0} />
        ) : (
          <File size={12} className="text-textDim" strokeWidth={1.8} />
        )}
      </span>
      <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${entry.isDir ? 'text-accentFg' : 'text-text'}`}>
        {entry.name}
      </span>
      <span className="w-[78px] shrink-0 text-right font-mono text-[11px] text-textDim">
        {entry.isDir ? '—' : formatSize(entry.size)}
      </span>
      <span className="w-[110px] shrink-0 text-right font-mono text-[11px] text-textDim">
        {formatModTime(entry.modTime)}
      </span>
    </div>
  )
}
