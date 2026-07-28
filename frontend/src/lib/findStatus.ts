// What the find bar shows next to its input. addon-search reports results as
// a zero-based index plus a count, and signals "more matches than
// highlightLimit" by setting the index to -1 while keeping the count.
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
