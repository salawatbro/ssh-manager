import type { DragEvent, MouseEvent } from 'react'
import { File, Folder } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import type { ClickModifiers } from '../../lib/sftpSelection'
import { formatModTime, formatSize } from '../../lib/fileFormat'

// Shared by the parent ("..") row FilePane draws above the listing, so the two
// line up to the pixel.
export const ROW = 'ml-[6px] mr-[4px] flex h-[24px] shrink-0 cursor-default items-center gap-[8px] rounded-[4px] px-[7px]'

interface Props {
  entry: FileEntry
  // The directory this entry lives in — joined with entry.name for the tooltip
  // and the drag payload.
  basePath: string
  selected: boolean
  // Dimmed while this row is part of the in-flight drag (Zish.dc.html: the
  // dragged rows go to opacity-50 so it is obvious what is in the air).
  dragging: boolean
  onSelect: (mod: ClickModifiers) => void
  onOpen: () => void
  onContextMenu: (x: number, y: number) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function joinPath(base: string, name: string): string {
  return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`
}

// One directory entry, local or remote (the same row shape serves both panes —
// only basePath and what the callbacks do differ). Presentational: the selection
// rules live in lib/sftpSelection.ts and FilePane applies them.
//
// Redesign (Zish.dc.html SFTP panes): 24px inset rows, the name in mono, and
// directories in accentFg so the tree structure reads at a glance while files
// stay plain text. The permission string left the row with it — at this density
// `mode` pushed the date column around for something a user reads rarely, so it
// moved into the row's tooltip alongside the full path. Nothing is lost, and the
// date finally has a fixed column of its own.
export function FileRow({
  entry,
  basePath,
  selected,
  dragging,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: Props) {
  const fullPath = joinPath(basePath, entry.name)

  function modifiersOf(e: MouseEvent): ClickModifiers {
    // metaKey on macOS; ctrlKey is accepted too so the gesture still works if
    // this ever runs on a non-Apple keyboard.
    return { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey }
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    // WebKit only fires `drop` when the drag carries data, so the payload has to
    // be set here. It is the row's own path; the real target list (which may be
    // a whole multi-selection) travels in the selection store.
    e.dataTransfer.setData('text/plain', fullPath)
    e.dataTransfer.effectAllowed = 'copy'
    onDragStart()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => onSelect(modifiersOf(e))}
      onDoubleClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault()
        // Stops the pane's background handler from ALSO firing for this click —
        // a row right-click opens the row menu, not the empty-space one.
        e.stopPropagation()
        onContextMenu(e.clientX, e.clientY)
      }}
      title={`${fullPath}\n${entry.mode}`}
      className={`${ROW} ${selected ? 'bg-bgSel' : 'hover:bg-bgSel'} ${dragging ? 'opacity-50' : ''}`}
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
