import Fuse from 'fuse.js'

// Search the pane-local compose history. Empty queries preserve recency;
// fuzzy results retain Fuse's score order. Duplicate commands are collapsed
// globally, keeping their newest occurrence.
export function searchHistory(items: string[], query: string): string[] {
  const unique = [...new Set(items)]
  const q = query.trim()
  if (!q) return unique
  return new Fuse(unique, { threshold: 0.4, ignoreLocation: true }).search(q).map((result) => result.item)
}
