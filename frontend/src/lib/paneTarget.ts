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
