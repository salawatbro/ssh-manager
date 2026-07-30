import { describe, it, expect, vi } from 'vitest'
import type { MenuItem } from '../ui/ContextMenu'
import { paneMenuItems, type PaneMenuActions } from './paneMenu'

function actions(): PaneMenuActions {
  return {
    open: vi.fn(),
    transfer: vi.fn(),
    copyPath: vi.fn(),
    mkdir: vi.fn(),
    newFile: vi.fn(),
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

  // Both panes are full file managers now — the local pane offers the same
  // mutations as the remote one, dispatched to the local filesystem.
  it('offers the same mutations on the local pane', () => {
    const items = labels(
      paneMenuItems({ side: 'local', target: { names: ['a.txt'], isDir: false }, destPath: '/srv', actions: actions() }),
    )
    expect(items).toEqual(['Upload to /srv', 'Copy path', 'New folder…', 'New file…', 'Rename…', 'Delete'])
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

  it('offers New folder / New file on empty space, both panes', () => {
    expect(labels(paneMenuItems({ side: 'local', target: null, destPath: '/srv', actions: actions() }))).toEqual([
      'New folder…',
      'New file…',
      'Refresh',
    ])
    expect(labels(paneMenuItems({ side: 'remote', target: null, destPath: '~', actions: actions() }))).toEqual([
      'New folder…',
      'New file…',
      'Refresh',
    ])
  })

  it('offers New file… wherever New folder… appears', () => {
    const onRow = labels(
      paneMenuItems({ side: 'remote', target: { names: ['a.txt'], isDir: false }, destPath: '~', actions: actions() }),
    )
    expect(onRow).toContain('New file…')
    expect(onRow).toContain('New folder…')
  })
})
