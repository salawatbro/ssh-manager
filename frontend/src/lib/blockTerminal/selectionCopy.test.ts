import { describe, expect, it } from 'vitest'
import { shouldAllowSelectionCopy, type SelectionCopyKey } from './selectionCopy'

const key = (patch: Partial<SelectionCopyKey>): SelectionCopyKey => ({
  key: 'c', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...patch,
})

describe('shouldAllowSelectionCopy', () => {
  it('allows Cmd+C on macOS and Ctrl+C elsewhere when text is selected', () => {
    expect(shouldAllowSelectionCopy(key({ metaKey: true }), true, true)).toBe(true)
    expect(shouldAllowSelectionCopy(key({ ctrlKey: true }), true, false)).toBe(true)
  })

  it('keeps Ctrl+C available as terminal interrupt without a selection', () => {
    expect(shouldAllowSelectionCopy(key({ ctrlKey: true }), false, false)).toBe(false)
  })

  it('rejects the wrong platform modifier and modified copy chords', () => {
    expect(shouldAllowSelectionCopy(key({ ctrlKey: true }), true, true)).toBe(false)
    expect(shouldAllowSelectionCopy(key({ metaKey: true, shiftKey: true }), true, true)).toBe(false)
  })
})
