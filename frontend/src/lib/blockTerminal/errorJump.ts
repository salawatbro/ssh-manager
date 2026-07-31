import type { TermBlock } from './types'

// Ids of finished blocks that exited non-zero, in document order. Running
// blocks (exitCode null) never count — a command in flight hasn't failed yet.
export function failedIds(blocks: TermBlock[]): string[] {
  return blocks.filter((b) => !b.running && b.exitCode != null && b.exitCode > 0).map((b) => b.id)
}

// The next failed id after `current`, wrapping. Null/absent current (or an
// empty list) starts at the first id; empty list → null.
export function nextFailedId(ids: string[], current: string | null): string | null {
  if (ids.length === 0) return null
  const i = current == null ? -1 : ids.indexOf(current)
  if (i < 0) return ids[0]
  return ids[(i + 1) % ids.length]
}
