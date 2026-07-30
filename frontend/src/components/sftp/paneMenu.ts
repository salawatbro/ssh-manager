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
  newFile: () => void
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

// The SFTP pane's right-click menu (Zish.dc.html sftp menu). Both panes are full
// file managers: the local mutations act on this machine's files, the remote
// ones on the open session, and SftpView routes each accordingly. Deleting or
// renaming a local file touches the user's real filesystem, which is why Delete
// goes through a confirm and Rename refuses to overwrite.
export function paneMenuItems({ side, target, destPath, actions }: PaneMenuInput): MenuEntry[] {
  const isRemote = side === 'remote'

  if (target === null) {
    return [
      { label: 'New folder…', run: actions.mkdir },
      { label: 'New file…', run: actions.newFile },
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
    'separator',
    { label: 'New folder…', run: actions.mkdir },
    { label: 'New file…', run: actions.newFile },
    ...(single ? [{ label: 'Rename…', run: () => actions.rename(names[0]) }] : []),
    'separator',
    { label: counted('Delete', names), danger: true, run: () => actions.remove(names) },
  ]
}
