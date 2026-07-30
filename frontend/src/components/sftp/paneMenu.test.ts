import { describe, it, expect, vi } from 'vitest'
import type { MenuItem } from '../ui/ContextMenu'
import { paneMenuItems, type PaneMenuActions } from './paneMenu'

function actions(): PaneMenuActions {
  return {
    open: vi.fn(),
    transfer: vi.fn(),
    copyPath: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
  }
}

function labels(items: ReturnType<typeof paneMenuItems>): string[] {
  return items.filter((i): i is MenuItem => i !== 'separator').map((i) => i.label)
}

describe('paneMenuItems', () => {
  it('offers upload to the other pane, with a count for a multi-selection', () => {
    const one = labels(
      paneMenuItems({ side: 'local', target: { names: ['a.txt'], isDir: false }, destPath: '/srv/cbs', actions: actions() }),
    )
    expect(one).toContain('Upload to /srv/cbs')
    const many = labels(
      paneMenuItems({
        side: 'local',
        target: { names: ['a.txt', 'b.txt', 'c.txt'], isDir: false },
        destPath: '/srv/cbs',
        actions: actions(),
      }),
    )
    expect(many).toContain('Upload 3 items to /srv/cbs')
  })

  it('names the remote direction download', () => {
    const items = labels(
      paneMenuItems({
        side: 'remote',
        target: { names: ['a.txt', 'b.txt'], isDir: false },
        destPath: '~/Downloads',
        actions: actions(),
      }),
    )
    expect(items).toContain('Download 2 items to ~/Downloads')
    expect(items).toContain('Delete 2 items')
    // Renaming two files at once has no meaning.
    expect(items).not.toContain('Rename…')
  })

  // The local pane has no mutating backend at all (every SftpService write takes
  // a session id and lands on the remote host). If someone adds a local Delete
  // to the menu, they have to add the backend that makes it work first.
  it('never offers a local mutation', () => {
    const items = labels(
      paneMenuItems({ side: 'local', target: { names: ['a.txt'], isDir: false }, destPath: '/srv', actions: actions() }),
    )
    expect(items).toEqual(['Upload to /srv', 'Copy path'])
  })

  it('offers Open for a single folder only', () => {
    const dir = labels(
      paneMenuItems({ side: 'remote', target: { names: ['logs'], isDir: true }, destPath: '~', actions: actions() }),
    )
    expect(dir[0]).toBe('Open')
    const dirs = labels(
      paneMenuItems({ side: 'remote', target: { names: ['logs', 'tmp'], isDir: true }, destPath: '~', actions: actions() }),
    )
    expect(dirs).not.toContain('Open')
  })

  it('falls back to the folder actions on empty space', () => {
    expect(labels(paneMenuItems({ side: 'local', target: null, destPath: '/srv', actions: actions() }))).toEqual(['Refresh'])
    expect(labels(paneMenuItems({ side: 'remote', target: null, destPath: '~', actions: actions() }))).toEqual([
      'New folder…',
      'Refresh',
    ])
  })

  // SftpService can create a directory but not an empty file, so the design's
  // "New file…" is deliberately absent everywhere.
  it('offers no New file… until a backend exists for it', () => {
    const everywhere = [
      paneMenuItems({ side: 'local', target: null, destPath: '/srv', actions: actions() }),
      paneMenuItems({ side: 'remote', target: null, destPath: '~', actions: actions() }),
      paneMenuItems({ side: 'remote', target: { names: ['a.txt'], isDir: false }, destPath: '~', actions: actions() }),
    ].flatMap(labels)
    expect(everywhere).not.toContain('New file…')
  })
})
