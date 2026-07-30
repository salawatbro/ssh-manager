import { create } from 'zustand'
import { nextSelection, type ClickModifiers, type PaneSelection, type PaneSide } from '../lib/sftpSelection'

interface DragState {
  side: PaneSide
  names: string[]
}

interface SftpSelectionState {
  selection: PaneSelection | null
  // The in-flight row drag, and the pane the pointer is currently over. BOTH
  // panes have to see these — a drop target is always the pane the drag did not
  // start in — which is why they live in a store rather than in SftpView.
  drag: DragState | null
  dropSide: PaneSide | null

  click: (side: PaneSide, index: number, rowNames: string[], mod: ClickModifiers) => void
  // Set the selection outright, for the gestures that do not follow the click
  // rules: a right-click or a drag on a row outside the selection selects
  // exactly what it is about to act on.
  replace: (side: PaneSide, names: string[], anchor: number) => void
  clearSide: (side: PaneSide) => void
  beginDrag: (side: PaneSide, names: string[]) => void
  hoverDrop: (side: PaneSide | null) => void
  endDrag: () => void
}

// Kept out of stores/sftp.ts on purpose: that store owns the session and the
// transfers, this one owns what the user has picked in the panes. Nothing here
// touches the backend.
export const useSftpSelection = create<SftpSelectionState>((set) => ({
  selection: null,
  drag: null,
  dropSide: null,

  click: (side, index, rowNames, mod) =>
    set((s) => ({ selection: nextSelection(s.selection, side, index, rowNames, mod) })),
  replace: (side, names, anchor) => set({ selection: { side, names, anchor } }),
  clearSide: (side) => set((s) => (s.selection?.side === side ? { selection: null } : {})),
  beginDrag: (side, names) => set({ drag: { side, names } }),
  // Same value is a no-op so a dragover, which fires continuously, does not
  // re-render both panes on every mouse move.
  hoverDrop: (side) => set((s) => (s.dropSide === side ? {} : { dropSide: side })),
  endDrag: () => set({ drag: null, dropSide: null }),
}))

// Called from stores/sftp.ts when a pane actually changes directory: names mean
// nothing in a different folder. Deliberately NOT called on a plain refresh —
// every finished transfer refreshes both panes, and dropping the user's
// selection each time one lands would make a second drag impossible.
export function clearPaneSelection(side: PaneSide) {
  useSftpSelection.getState().clearSide(side)
}
