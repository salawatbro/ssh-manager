import type { Segment } from './types'

// http/https only — a scheme is required (no bare www.), to keep detection
// conservative against terminal output. The character class stops at
// whitespace and shell/markup delimiters; trailing sentence punctuation is
// trimmed after the match so "…/path." links "…/path".
// KNOWN LIMITATION: a URL containing "(" or ")" (e.g. a MediaWiki-style link
// like ".../wiki/Foo_(bar)") truncates at the parenthesis, because "()" are
// excluded from the character class to keep the match conservative. This is
// deliberate — widening the class risks swallowing trailing markup/punctuation
// that isn't part of the URL — so a later phase should not "fix" this without
// revisiting that tradeoff.
const URL_RE = /https?:\/\/[^\s<>"'`()[\]{}]+/g
const TRAILING = /[.,;:!?]+$/

// Split any URL inside a line's text into its own tc-lnk segment. A line with
// no URL (and any segment already carrying a link) is returned unchanged by
// reference, so the common case allocates nothing.
//
// The ANSI parser (ansi.ts) does not coalesce adjacent same-style segments,
// and the PTY delivers output in arbitrary chunk boundaries (machine.ts calls
// ansi.write() once per chunk) — so a single URL commonly arrives split across
// two or more adjacent segments that happen to share the same `cls`. To avoid
// linking a truncated fragment, adjacent link-free segments with an identical
// `cls` are grouped into a "run" and matched as one joined string before
// splitting. A URL whose styling changes mid-URL (different `cls` on either
// side of the split point) is deliberately NOT joined — that's a genuinely
// different, out-of-scope case: a styling boundary is treated as a hard
// segment boundary.
export function splitLinks(line: Segment[]): Segment[] {
  let touched = false
  const out: Segment[] = []
  let run: Segment[] = []

  const flushRun = () => {
    if (run.length === 0) return
    const parts = splitRun(run)
    if (parts) {
      touched = true
      out.push(...parts)
    } else {
      out.push(...run) // no URL in the run — keep the original segment objects/identity
    }
    run = []
  }

  for (const s of line) {
    if (s.link) {
      flushRun()
      out.push(s)
      continue
    }
    if (run.length > 0 && run[0].cls !== s.cls) flushRun()
    run.push(s)
  }
  flushRun()

  return touched ? out : line
}

// Returns null when the run holds no URL, so the caller can keep the run's
// original segment references. A run that is ENTIRELY one URL returns a
// single-element array — do not treat "one part" as "no match".
function splitRun(run: Segment[]): Segment[] | null {
  const cls = run[0].cls
  const text = run.map((s) => s.text).join('')
  if (!text.includes('://')) return null

  const parts: Segment[] = []
  let last = 0
  URL_RE.lastIndex = 0
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    let url = m[0]
    const trail = TRAILING.exec(url)
    if (trail) url = url.slice(0, url.length - trail[0].length)
    const start = m.index
    if (start > last) parts.push({ text: text.slice(last, start), cls })
    parts.push({ text: url, cls: cls ? `${cls} tc-lnk` : 'tc-lnk', link: { kind: 'url', target: url } })
    last = start + url.length
  }
  if (parts.length === 0) return null
  if (last < text.length) parts.push({ text: text.slice(last), cls })
  return parts
}
