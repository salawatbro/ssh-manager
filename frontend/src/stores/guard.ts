import { create } from 'zustand'

// GuardTarget is one row in the modal: env drives the square swatch (UI-11),
// host is the label shown next to it. Shared shape for every call site: typed
// input and snippet run each pass exactly one target (the focused pane's), and
// only broadcast can pass many.
export interface GuardTarget {
  host: string
  env: string
}

interface GuardState {
  open: boolean
  command: string
  title: string
  targets: GuardTarget[]
  onConfirm: (() => void) | null
  // Opens the modal. onConfirm runs only if the user types "run" and clicks
  // Confirm — see GuardModal. `title` is optional so a caller that only
  // ever guards one scope (or a test) can omit it; every production call
  // site passes the title guardDecisionFor already computed.
  requestGuard: (args: { command: string; title?: string; targets: GuardTarget[]; onConfirm: () => void }) => void
  // Closes WITHOUT invoking onConfirm. Whether that leaves the caller's own
  // input buffer intact (FR-14.11) is the caller's responsibility — this
  // store only owns the modal's visibility/content.
  cancel: () => void
  close: () => void
}

// A stable empty fallback for `targets`, mirroring TunnelsPanel's
// NO_FORWARDS: keeps the closed state's array reference stable across
// renders instead of minting a fresh `[]` each time, which would fail
// React's snapshot-consistency check under Zustand v5's unmemoized
// useSyncExternalStore.
const NO_TARGETS: GuardTarget[] = []

const CLOSED = { open: false, command: '', title: 'Confirm on production', targets: NO_TARGETS, onConfirm: null } as const

export const useGuard = create<GuardState>((set) => ({
  ...CLOSED,

  requestGuard: ({ command, title, targets, onConfirm }) =>
    set({ open: true, command, title: title ?? 'Confirm on production', targets, onConfirm }),
  cancel: () => set(CLOSED),
  close: () => set(CLOSED),
}))
