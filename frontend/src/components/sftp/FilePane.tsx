import { useState, type DragEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import type { FileEntry } from '@bindings/github.com/salawat/sshmgr/internal/sftpx'
import { useSftp } from '../../stores/sftp'
import { useSftpSelection } from '../../stores/sftpSelection'
import { useView } from '../../stores/view'
import { actionTargets, selectedIn, type PaneSide } from '../../lib/sftpSelection'
import { isEditableFile } from '../../lib/fileEditor'
import { formatSize } from '../../lib/fileFormat'
// Both sides are POSIX here: the remote is always POSIX over SFTP, and the local
// side is macOS. One pair of helpers serves both panes.
import { dirnameRemote, joinRemote } from '../../lib/remotePath'
import { ContextMenu } from '../ui/ContextMenu'
import { FileRow, ROW } from './FileRow'
import { paneMenuItems, type PaneMenuTarget } from './paneMenu'

interface Props {
  side: PaneSide
  // Fired with the DESTINATION side and the bare names to move there. SftpView
  // owns this: it is the only place that sees both listings, so it is the only
  // place that can check for an overwrite before starting anything.
  onTransfer: (dest: PaneSide, names: string[]) => void
  // Remote-only, and left off for the local pane: every mutating SftpService
  // call takes a session id. paneMenuItems draws no local mutation either way,
  // so these are unreachable there rather than merely inert.
  onMkdir?: () => void
  onRename?: (name: string) => void
  onDelete?: (names: string[]) => void
}

interface MenuState {
  x: number
  y: number
  target: PaneMenuTarget | null
}

// One SFTP pane — the same component renders both sides (Zish.dc.html draws them
// as one shape twice). The 26px header is the whole chrome: side label, cwd, and
// the two transient captions ("N selected" while a multi-selection is live,
// "Drop to upload/download" while a drag hovers). Navigating up is the ".." row
// rather than a header button, which is where the old 34px header and the
// refresh-only toolbar went.
export function FilePane({ side, onTransfer, onMkdir, onRename, onDelete }: Props) {
  const isLocal = side === 'local'
  const cwd = useSftp((s) => (isLocal ? s.localCwd : s.remoteCwd))
  const entries = useSftp((s) => (isLocal ? s.localEntries : s.remoteEntries))
  const destPath = useSftp((s) => (isLocal ? s.remoteCwd : s.localCwd))
  const selection = useSftpSelection((s) => s.selection)
  const drag = useSftpSelection((s) => s.drag)
  const dropSide = useSftpSelection((s) => s.dropSide)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const rowNames = entries.map((e) => e.name)
  // Intersected with what is actually listed: a refresh can drop a selected name
  // (our own Delete, or someone else's rm on the host), and the "N selected"
  // caption must not go on counting it.
  const selected = selectedIn(selection, side).filter((n) => rowNames.includes(n))
  const dragging = drag !== null && drag.side === side ? drag.names : []
  const isDropTarget = drag !== null && drag.side !== side && dropSide === side
  const atRoot = cwd === '/' || cwd === ''

  function navigate(dir: string) {
    const store = useSftp.getState()
    void (isLocal ? store.navLocal(dir) : store.navRemote(dir))
  }

  // Double-clicking a file hands it to the editor, which decides from the name
  // and size whether it shows a textarea or the can't-edit panel.
  function openInEditor(entry: FileEntry) {
    useView.getState().openEditor({
      side,
      name: entry.name,
      path: joinRemote(cwd, entry.name),
      size: formatSize(entry.size),
      editable: isEditableFile(entry.name, entry.size),
    })
  }

  // The selection is what a right-click or a drag acts on, but only when the row
  // under the pointer belongs to it — see lib/sftpSelection.ts.
  function targetsFor(name: string): string[] {
    return actionTargets(selection, side, name)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (drag === null || drag.side === side) return
    // preventDefault is what marks this pane a valid drop target at all.
    e.preventDefault()
    useSftpSelection.getState().hoverDrop(side)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    // dragleave also fires when the pointer crosses into one of the pane's own
    // rows; ignoring those keeps the highlight from strobing on every row edge.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    useSftpSelection.getState().hoverDrop(null)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const names = drag !== null && drag.side !== side ? drag.names : []
    useSftpSelection.getState().endDrag()
    if (names.length > 0) onTransfer(side, names)
  }

  const items = menu
    ? paneMenuItems({
        side,
        target: menu.target,
        destPath,
        actions: {
          open: (name) => navigate(joinRemote(cwd, name)),
          transfer: (names) => onTransfer(isLocal ? 'remote' : 'local', names),
          copyPath: (names) => {
            void navigator.clipboard.writeText(names.map((n) => joinRemote(cwd, n)).join('\n')).catch(() => {})
          },
          mkdir: () => onMkdir?.(),
          rename: (name) => onRename?.(name),
          remove: (names) => onDelete?.(names),
          refresh: () => void useSftp.getState().refresh(),
        },
      })
    : []

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      // The drop background replaces bg-bg1 rather than layering over it: two
      // background utilities on one element are resolved by their order in the
      // generated stylesheet, not by the order they appear in this string.
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${isLocal ? 'border-r border-border' : ''} ${
        isDropTarget ? 'bg-accentDim/40 shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'bg-bg1'
      }`}
    >
      <div className="flex h-[26px] shrink-0 items-center gap-[6px] border-b border-border bg-bg1b px-[10px]">
        <span className="shrink-0 text-[10.5px] font-semibold tracking-[.07em] text-textDim">
          {isLocal ? 'LOCAL' : 'REMOTE'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-textMuted" title={cwd}>
          {cwd}
        </span>
        {isDropTarget ? (
          <span className="shrink-0 text-[10.5px] text-accentFg">{isLocal ? 'Drop to download' : 'Drop to upload'}</span>
        ) : (
          selected.length > 1 && <span className="shrink-0 text-[10.5px] text-accentFg">{selected.length} selected</span>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto py-[2px]"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, target: null })
        }}
      >
        {!atRoot && (
          <div
            title="Parent directory — double-click"
            onDoubleClick={() => navigate(dirnameRemote(cwd))}
            className={`${ROW} hover:bg-bgSel`}
          >
            <span className="flex w-[13px] shrink-0 items-center justify-center">
              <ArrowUp size={12} className="text-textDim" />
            </span>
            <span className="min-w-0 flex-1 font-mono text-[12px] text-textDim">..</span>
          </div>
        )}
        {entries.length === 0 ? (
          <div className="px-[11px] pt-[8px] text-[11.5px] text-textDim">Empty folder</div>
        ) : (
          entries.map((entry, index) => (
            <FileRow
              key={entry.name}
              entry={entry}
              basePath={cwd}
              selected={selected.includes(entry.name)}
              dragging={dragging.includes(entry.name)}
              onSelect={(mod) => useSftpSelection.getState().click(side, index, rowNames, mod)}
              onOpen={() => (entry.isDir ? navigate(joinRemote(cwd, entry.name)) : openInEditor(entry))}
              // Both of these resolve their targets from the CURRENT selection
              // first and then select exactly those — right-clicking or dragging
              // a row inside a multi-selection must not collapse it to one row.
              onContextMenu={(x, y) => {
                const names = targetsFor(entry.name)
                useSftpSelection.getState().replace(side, names, index)
                setMenu({ x, y, target: { names, isDir: entry.isDir } })
              }}
              onDragStart={() => {
                const names = targetsFor(entry.name)
                useSftpSelection.getState().replace(side, names, index)
                useSftpSelection.getState().beginDrag(side, names)
              }}
              onDragEnd={() => useSftpSelection.getState().endDrag()}
            />
          ))
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}
