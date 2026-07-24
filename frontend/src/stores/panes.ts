import { create } from 'zustand'
// Type-only import cycle: this hook imports `useSessions`/`usePanes` from this
// directory, and this file imports `TermStatus` back from the hook. This is
// type-only (erased at build time), so there is no runtime cycle — it already
// existed in this exact shape in stores/sessions.ts before this file split
// out of it, and it is fine under Vite. Don't "fix" it by relocating
// TermStatus; there is nothing to fix.
import type { TermStatus } from '../hooks/useTerminalSession'

// A pane's live xterm grid size, keyed by leaf (pane) id — mirrors paneStatus
// below; lets the status bar show the ACTIVE pane's dims without its own xterm.
export interface PaneDims {
  cols: number
  rows: number
}

// A pane's detected shell and whether a shell-integration snippet was actually
// injected for it, keyed by leaf (pane) id — mirrors paneStatus/paneDims. The
// status bar reads this to report integration honestly instead of implying it
// is always on.
export interface PaneShell {
  shell: string
  integration: boolean
}

// Shared by the per-pane maps' clear* actions (paneStatus/paneDims/paneSession):
// drop one key, or return the same record reference untouched if it's absent.
function clearKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

interface PanesState {
  // Per-pane connection status, keyed by leaf (pane) id — mirrored from
  // useTerminalSession so the tab strip (no PTY of its own) can read it.
  paneStatus: Record<string, TermStatus>
  setPaneStatus: (paneId: string, status: TermStatus) => void
  clearPaneStatus: (paneId: string) => void
  paneDims: Record<string, PaneDims>
  setPaneDims: (paneId: string, dims: PaneDims) => void
  clearPaneDims: (paneId: string) => void
  // paneId → live session id (useTerminalSession); BroadcastBar's source for sessionIds.
  paneSession: Record<string, string>
  setPaneSession: (paneId: string, sessionId: string) => void
  paneShell: Record<string, PaneShell>
  setPaneShell: (paneId: string, info: PaneShell) => void
  // Both cleared together, once, from useTerminalSession's cleanup — a single
  // action rather than two separate calls so "the pane's session and shell
  // info both drop on teardown" is one behavior a store test can hold to,
  // not two independent call sites that could silently drift apart.
  //
  // Pane removal is deliberately DECOUPLED from clearing these maps: nothing
  // here is driven by stores/sessions.ts's closeTab/closePane. Clearing is
  // driven entirely by Terminal's unmount effects (clearPaneStatus/
  // clearPaneDims, each its own effect keyed only on paneId) and by
  // useTerminalSession's cleanup (this action). Terminal always unmounts when
  // its pane or tab closes, so that teardown always runs — closePane does not
  // need to (and must not) also reach into this store. Wiring closePane to
  // call clearPaneConnection/clearPaneStatus/clearPaneDims directly would
  // double-clear and risks a race against Terminal's own cleanup (e.g.
  // clearing before its effect has read the entry it needs). This looked like
  // an odd omission once paneStatus/paneDims/paneSession/paneShell lived next
  // to closeTab/closePane in one file; keep the two write paths independent.
  clearPaneConnection: (paneId: string) => void
}

export const usePanes = create<PanesState>((set) => ({
  paneStatus: {},
  setPaneStatus: (paneId, status) => set((s) => ({ paneStatus: { ...s.paneStatus, [paneId]: status } })),
  clearPaneStatus: (paneId) => set((s) => ({ paneStatus: clearKey(s.paneStatus, paneId) })),

  paneDims: {},
  setPaneDims: (paneId, dims) => set((s) => ({ paneDims: { ...s.paneDims, [paneId]: dims } })),
  clearPaneDims: (paneId) => set((s) => ({ paneDims: clearKey(s.paneDims, paneId) })),

  paneSession: {},
  setPaneSession: (paneId, sessionId) => set((s) => ({ paneSession: { ...s.paneSession, [paneId]: sessionId } })),

  paneShell: {},
  setPaneShell: (paneId, info) => set((s) => ({ paneShell: { ...s.paneShell, [paneId]: info } })),

  clearPaneConnection: (paneId) =>
    set((s) => ({
      paneSession: clearKey(s.paneSession, paneId),
      paneShell: clearKey(s.paneShell, paneId),
    })),
}))
