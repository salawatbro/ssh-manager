import type { MenuEntry } from '../ui/ContextMenu'
import type { PaneSide } from '../../lib/sftpSelection'

export interface PaneMenuTarget {
  names: string[]
  // A folder gets "Open"; a multi-selection never does, since only one thing can
  // be navigated into.
  isDir: boolean
}

export interface PaneMenuActions {
  open: (name: string) => void
  transfer: (names: string[]) => void
  copyPath: (names: string[]) => void
  mkdir: () => void
  rename: (name: string) => void
  remove: (names: string[]) => void
  refresh: () => void
}

export interface PaneMenuInput {
  side: PaneSide
  // null for a right-click on empty space below the rows.
  target: PaneMenuTarget | null
  // The other pane's cwd — where a transfer out of this pane would land. It is
  // in the label because the destination is never the folder being clicked in.
  destPath: string
  actions: PaneMenuActions
}

function counted(verb: string, names: string[]): string {
  return names.length > 1 ? `${verb} ${names.length} items` : verb
}

// The SFTP pane's right-click menu (Zish.dc.html sftp menu).
//
// Items the design draws that are NOT here, because no backend call exists
// behind them: "New file…" (SftpService can make a directory, not an empty
// file) and, on the LOCAL side, "New folder…" / "Rename…" / "Delete" — every
// mutating SftpService method takes a session id and acts on the remote host.
// Drawing them anyway would give the user a menu item that can only fail.
export function paneMenuItems({ side, target, destPath, actions }: PaneMenuInput): MenuEntry[] {
  const isRemote = side === 'remote'

  if (target === null) {
    return [
      ...(isRemote ? [{ label: 'New folder…', run: actions.mkdir }] : []),
      { label: 'Refresh', run: actions.refresh },
    ]
  }

  const { names, isDir } = target
  const single = names.length === 1
  const transfer = counted(isRemote ? 'Download' : 'Upload', names)

  return [
    ...(isDir && single ? [{ label: 'Open', run: () => actions.open(names[0]) }] : []),
    { label: `${transfer} to ${destPath}`, run: () => actions.transfer(names) },
    { label: single ? 'Copy path' : 'Copy paths', run: () => actions.copyPath(names) },
    ...(isRemote
      ? ([
          'separator',
          { label: 'New folder…', run: actions.mkdir },
          ...(single ? [{ label: 'Rename…', run: () => actions.rename(names[0]) }] : []),
          'separator',
          { label: counted('Delete', names), danger: true, run: () => actions.remove(names) },
        ] as MenuEntry[])
      : []),
  ]
}
