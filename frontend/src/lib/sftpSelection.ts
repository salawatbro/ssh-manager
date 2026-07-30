// Which pane a selection or a drag belongs to. Only ONE pane owns the selection
// at a time (Zish.dc.html keeps a single `{ side, names, anchor }` object):
// clicking in the other pane takes it over. That is what makes "the selection"
// an unambiguous transfer source — there is never a question of which side the
// files being uploaded came from.
export type PaneSide = 'local' | 'remote'

export interface PaneSelection {
  side: PaneSide
  names: string[]
  // The row index a ⇧-click ranges from. Every plain or ⌘ click moves it to the
  // clicked row, so a ⇧-click always extends from the last row touched.
  anchor: number
}

export interface ClickModifiers {
  shift: boolean
  meta: boolean
}

// `rowNames` is the pane's rows in display order with ".." excluded, and every
// index here is an index into it — so nothing in this file has to know that a
// parent row exists at all.
export function nextSelection(
  current: PaneSelection | null,
  side: PaneSide,
  index: number,
  rowNames: string[],
  mod: ClickModifiers,
): PaneSelection {
  const name = rowNames[index]
  // A click on a row that is no longer listed (the directory changed under the
  // pointer) leaves the selection alone rather than selecting `undefined`.
  if (name === undefined) return current ?? { side, names: [], anchor: 0 }

  // The modifiers only compose with a selection in the SAME pane. Crossing over
  // starts fresh, so a ⇧-click can never range across two directories.
  const own = current !== null && current.side === side ? current : null

  if (own && mod.shift) {
    const from = Math.min(own.anchor, index)
    const to = Math.max(own.anchor, index)
    // The anchor stays put: dragging the shift-click up and down re-ranges from
    // the same origin instead of walking it along.
    return { side, names: rowNames.slice(from, to + 1), anchor: own.anchor }
  }
  if (own && mod.meta) {
    const names = own.names.includes(name) ? own.names.filter((n) => n !== name) : [...own.names, name]
    return { side, names, anchor: index }
  }
  return { side, names: [name], anchor: index }
}

// [] when the other pane owns the selection, so a pane never paints a stale
// highlight on rows it does not own.
export function selectedIn(current: PaneSelection | null, side: PaneSide): string[] {
  return current !== null && current.side === side ? current.names : []
}

// What a right-click or a drag acts on: the whole multi-selection when the row
// under the pointer belongs to it, otherwise just that row. Same rule as
// Finder — grabbing an unselected row does not drag the selection along with it.
export function actionTargets(current: PaneSelection | null, side: PaneSide, name: string): string[] {
  const names = selectedIn(current, side)
  return names.length > 1 && names.includes(name) ? names : [name]
}
