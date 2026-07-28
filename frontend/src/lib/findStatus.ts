// What the find bar shows next to its input. addon-search reports results as
// a zero-based index plus a count. The index comes back -1 whenever the addon
// can't identify which highlighted match is the active one — the common case
// being more matches than highlightLimit, since matches past the limit are
// never highlighted and so can never be "the active one" either — but the
// count is still meaningful, so the bar falls back to `${resultCount}+`.
export interface FindResults {
  resultIndex: number
  resultCount: number
}

export function formatFindStatus(query: string, r: FindResults | null): string {
  if (!query) return ''
  if (!r || r.resultCount === 0) return 'no matches'
  if (r.resultIndex < 0) return `${r.resultCount}+`
  return `${r.resultIndex + 1}/${r.resultCount}`
}
