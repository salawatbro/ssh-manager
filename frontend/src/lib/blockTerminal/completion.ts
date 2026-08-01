// Token maths for the compose line's Tab completion. Pure — no DOM, no React.

// The whitespace-delimited token the caret sits in. A caret right after a
// space yields an empty token at that position, which is what a bare Tab on a
// fresh argument should complete (everything in the directory).
export function tokenAt(line: string, caret: number): { start: number; end: number; text: string } {
  let start = caret
  while (start > 0 && !/\s/.test(line[start - 1])) start--
  let end = caret
  while (end < line.length && !/\s/.test(line[end])) end++
  return { start, end, text: line.slice(start, end) }
}

// Single-quote for POSIX shells. The prefix is interpolated into a command the
// REMOTE shell evaluates, so this is a security boundary, not cosmetics: inside
// single quotes every metacharacter is literal, and the only thing that can end
// the quoting is a single quote — which is why each one becomes '\''.
export function shellQuote(s: string): string {
  return `'${s.split("'").join("'\\''")}'`
}

// Replace the token under the caret with a candidate. A directory candidate
// (trailing '/') gets no space, so the next Tab descends into it; a file gets
// a trailing space, ready for the next argument. When the token isn't the
// last one on the line, tokenAt's end already sits on the pre-existing
// separator space — consuming it keeps a single space rather than stacking
// the completion's own space on top of it.
export function applyCompletion(
  line: string,
  caret: number,
  candidate: string,
): { line: string; caret: number } {
  const { start, end } = tokenAt(line, caret)
  const isDir = candidate.endsWith('/')
  const body = /\s/.test(candidate) ? shellQuote(candidate) : candidate
  const insert = isDir ? body : `${body} `
  const tailStart = !isDir && end < line.length && /\s/.test(line[end]) ? end + 1 : end
  return { line: line.slice(0, start) + insert + line.slice(tailStart), caret: start + insert.length }
}
