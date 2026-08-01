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

// Characters safe to leave bare in a shell word. Anything else in a REMOTE
// filename gets a backslash: a candidate is data from a directory listing, not
// the user's own text, and it lands in a line they are about to execute.
const SAFE = /[A-Za-z0-9@%+=:,./_~-]/

// Backslash-escape every character outside SAFE. This is what bash/zsh do for
// filename completion, and unlike shellQuote's wrapping it keeps the caret
// directly adjacent to the candidate's own text — important for a directory
// candidate, where a trailing quote character would sit between the caret and
// the path and break "the next Tab descends into it".
export function escapeArg(s: string): string {
  return Array.from(s)
    .map((ch) => (SAFE.test(ch) ? ch : `\\${ch}`))
    .join('')
}

// Inverse of escapeArg, for turning what sits in the compose line back into
// the literal prefix a later Tab (or the remote probe) should match against.
// Drops a backslash before any character, then additionally strips a leading
// quote and a matching trailing one, so a prefix the user typed by hand with
// quotes (e.g. `'my fi`) also round-trips to the literal text.
export function unescapeArg(s: string): string {
  const unescaped = s.replace(/\\(.)/g, '$1')
  const quote = unescaped[0]
  if (quote !== "'" && quote !== '"') return unescaped
  const hasMatchingTail = unescaped.length > 1 && unescaped[unescaped.length - 1] === quote
  return hasMatchingTail ? unescaped.slice(1, -1) : unescaped.slice(1)
}

// Replace the token under the caret with a candidate. A directory candidate
// (trailing '/') gets no space, so the next Tab descends into it; a file gets
// a trailing space, ready for the next argument. When the token isn't the
// last one on the line, tokenAt's end already sits on the pre-existing
// separator space — consuming it keeps a single space rather than stacking
// the completion's own space on top of it. The candidate is escaped rather
// than quoted (see escapeArg) because it is data from a remote directory
// listing, not the user's own text.
export function applyCompletion(
  line: string,
  caret: number,
  candidate: string,
): { line: string; caret: number } {
  const { start, end } = tokenAt(line, caret)
  const isDir = candidate.endsWith('/')
  const body = escapeArg(candidate)
  const insert = isDir ? body : `${body} `
  const tailStart = !isDir && end < line.length && /\s/.test(line[end]) ? end + 1 : end
  return { line: line.slice(0, start) + insert + line.slice(tailStart), caret: start + insert.length }
}
