import type { Segment } from './types'

// http/https only — a scheme is required (no bare www.), to keep detection
// conservative against terminal output. The character class stops at
// whitespace and shell/markup delimiters; trailing sentence punctuation is
// trimmed after the match so "…/path." links "…/path".
const URL_RE = /https?:\/\/[^\s<>"'`()[\]{}]+/g
const TRAILING = /[.,;:!?]+$/

// Split any URL inside each segment's text into its own tc-lnk segment. A line
// with no URL (and any segment already carrying a link) is returned unchanged
// by reference, so the common case allocates nothing.
export function splitLinks(line: Segment[]): Segment[] {
  let touched = false
  const out: Segment[] = []
  for (const s of line) {
    if (s.link || !s.text.includes('://')) { out.push(s); continue }
    const parts = splitSegment(s)
    if (!parts) { out.push(s); continue } // null = no URL in this segment
    touched = true
    out.push(...parts)
  }
  return touched ? out : line
}

// Returns null when the segment holds no URL, so the caller can keep the
// original reference. A segment that is ENTIRELY one URL returns a
// single-element array — do not treat "one part" as "no match".
function splitSegment(s: Segment): Segment[] | null {
  const parts: Segment[] = []
  let last = 0
  URL_RE.lastIndex = 0
  for (let m = URL_RE.exec(s.text); m; m = URL_RE.exec(s.text)) {
    let url = m[0]
    const trail = TRAILING.exec(url)
    if (trail) url = url.slice(0, url.length - trail[0].length)
    const start = m.index
    if (start > last) parts.push({ text: s.text.slice(last, start), cls: s.cls })
    parts.push({ text: url, cls: `${s.cls} tc-lnk`, link: { kind: 'url', target: url } })
    last = start + url.length
  }
  if (parts.length === 0) return null
  if (last < s.text.length) parts.push({ text: s.text.slice(last), cls: s.cls })
  return parts
}
