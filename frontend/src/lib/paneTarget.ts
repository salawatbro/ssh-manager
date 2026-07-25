// A pane's target is either a saved server or the local machine. PaneNode keeps
// carrying a plain `serverId: string`, and a local pane holds this sentinel
// instead of an id — real ids come from crypto.randomUUID(), so a collision is
// impossible, and paneTree (plus its tests) needs no change.
//
// The sentinel is never spelled out anywhere else: every branch goes through
// isLocalTarget, so switching to a discriminated PaneTarget union later touches
// only this file.
export const LOCAL_TARGET_ID = 'local'

export function isLocalTarget(serverId: string): boolean {
  return serverId === LOCAL_TARGET_ID
}

// The real server id behind a target, or null when the target is local (the
// sentinel) or there is no target at all. Callers that need an idle-state
// fallback (e.g. "no tab active, use the sidebar selection instead") compose
// it themselves on top of this — this function only ever answers "is there a
// real server here", nothing about what to show when there isn't a target.
export function serverTargetId(tab: { serverId: string } | null): string | null {
  return tab && !isLocalTarget(tab.serverId) ? tab.serverId : null
}
