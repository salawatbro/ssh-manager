import { describe, it, expect } from 'vitest'
import { actionTargets, nextSelection, selectedIn, type PaneSelection } from './sftpSelection'

const rows = ['a.txt', 'b.txt', 'c.txt', 'd.txt']
const plain = { shift: false, meta: false }
const shift = { shift: true, meta: false }
const meta = { shift: false, meta: true }

// The rules an SFTP pane's selection follows. They are here rather than in the
// component because a wrong range is invisible until it deletes the wrong files.
describe('nextSelection', () => {
  it('a plain click replaces the selection and moves the anchor', () => {
    const first = nextSelection(null, 'local', 2, rows, plain)
    expect(first).toEqual({ side: 'local', names: ['c.txt'], anchor: 2 })
    expect(nextSelection(first, 'local', 0, rows, plain)).toEqual({
      side: 'local',
      names: ['a.txt'],
      anchor: 0,
    })
  })

  it('⌘ toggles a row in and out without disturbing the rest', () => {
    const one = nextSelection(null, 'local', 0, rows, plain)
    const two = nextSelection(one, 'local', 2, rows, meta)
    expect(two.names).toEqual(['a.txt', 'c.txt'])
    expect(nextSelection(two, 'local', 0, rows, meta).names).toEqual(['c.txt'])
  })

  it('⇧ ranges from the anchor, in display order, either direction', () => {
    const anchored = nextSelection(null, 'local', 2, rows, plain)
    expect(nextSelection(anchored, 'local', 0, rows, shift).names).toEqual(['a.txt', 'b.txt', 'c.txt'])
    // Re-ranging keeps the original anchor, so it does not creep along.
    const down = nextSelection(anchored, 'local', 3, rows, shift)
    expect(down.names).toEqual(['c.txt', 'd.txt'])
    expect(down.anchor).toBe(2)
  })

  it('crossing to the other pane starts a fresh single selection', () => {
    const local = nextSelection(nextSelection(null, 'local', 0, rows, plain), 'local', 2, rows, meta)
    // Even with ⇧ held: a range across two different directories is meaningless.
    expect(nextSelection(local, 'remote', 3, rows, shift)).toEqual({
      side: 'remote',
      names: ['d.txt'],
      anchor: 3,
    })
  })

  it('ignores a click on a row that is no longer listed', () => {
    const current: PaneSelection = { side: 'local', names: ['a.txt'], anchor: 0 }
    expect(nextSelection(current, 'local', 9, rows, plain)).toBe(current)
    expect(nextSelection(null, 'local', 9, rows, plain)).toEqual({ side: 'local', names: [], anchor: 0 })
  })
})

describe('selectedIn / actionTargets', () => {
  const many: PaneSelection = { side: 'remote', names: ['a.txt', 'b.txt'], anchor: 0 }

  it('reports nothing for the pane that does not own the selection', () => {
    expect(selectedIn(many, 'remote')).toEqual(['a.txt', 'b.txt'])
    expect(selectedIn(many, 'local')).toEqual([])
    expect(selectedIn(null, 'remote')).toEqual([])
  })

  it('acts on the whole selection only when the clicked row is part of it', () => {
    expect(actionTargets(many, 'remote', 'b.txt')).toEqual(['a.txt', 'b.txt'])
    expect(actionTargets(many, 'remote', 'zzz.txt')).toEqual(['zzz.txt'])
    // Same name, other pane — the selection there is not ours to act on.
    expect(actionTargets(many, 'local', 'b.txt')).toEqual(['b.txt'])
  })

  it('treats a single selection as just that row', () => {
    const one: PaneSelection = { side: 'local', names: ['a.txt'], anchor: 0 }
    expect(actionTargets(one, 'local', 'a.txt')).toEqual(['a.txt'])
  })
})
