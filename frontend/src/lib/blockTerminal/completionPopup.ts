export const COMPLETION_POPUP_MAX = 50

// The shell already returned candidates for the prefix that opened the popup.
// While the user keeps typing, narrow that immutable snapshot locally with the
// same case-sensitive prefix semantics normal shell filename completion uses.
export function filterCompletionCandidates(candidates: string[], prefix: string): string[] {
  return candidates.filter((candidate) => candidate.startsWith(prefix))
}

export function moveCompletionSelection(current: number, delta: -1 | 1, count: number): number {
  const visible = Math.min(count, COMPLETION_POPUP_MAX)
  if (visible === 0) return 0
  return (current + delta + visible) % visible
}
