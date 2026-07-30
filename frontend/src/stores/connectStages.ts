import { create } from 'zustand'
import type { StageEvent } from '../lib/connectSteps'

// The connect:stage events received per connecting pane (keyed by the connectID
// the pane passed to SSHService.Open — its paneId). The connecting overlay reads
// these; useTerminalSession clears a pane's entry when its connect settles.
interface ConnectStagesState {
  byId: Record<string, StageEvent[]>
  append: (id: string, stage: string) => void
  clear: (id: string) => void
}

export const useConnectStages = create<ConnectStagesState>((set) => ({
  byId: {},
  // at = arrival time; the gap to the next stage is the phase's real duration.
  append: (id, stage) =>
    set((s) => ({ byId: { ...s.byId, [id]: [...(s.byId[id] ?? []), { stage, at: Date.now() }] } })),
  clear: (id) =>
    set((s) => {
      if (s.byId[id] === undefined) return {}
      const next = { ...s.byId }
      delete next[id]
      return { byId: next }
    }),
}))
