// Token maths for the compose line's Tab completion. Pure — no DOM, no React.

// Count the run of consecutive backslashes immediately before `pos`. Used to
// tell an escaped whitespace character (odd count — the last backslash
// escapes it) from one that follows an escaped backslash (even count, so the
// whitespace is unescaped and a real separator).
function precedingBackslashes(line: string, pos: number): number {
  let count = 0
  let i = pos - 1
  while (i >= 0 && line[i] === '\\') {
    count++
    i--
  }
  return count
}

// A position is a token separator when it holds whitespace that isn't itself
// escaped. `applyCompletion` backslash-escapes spaces in candidates (see
// escapeArg), so a directory named "my dir" round-trips through the compose
// line as `my\ dir/` — without this check, tokenAt would split that back into
// `my\` and `dir/` and the next Tab would probe the wrong prefix.
function isSeparator(line: string, pos: number): boolean {
  if (!/\s/.test(line[pos])) return false
  return precedingBackslashes(line, pos) % 2 === 0
}

// The whitespace-delimited token the caret sits in. A caret right after a
// space yields an empty token at that position, which is what a bare Tab on a
// fresh argument should complete (everything in the directory). An escaped
// whitespace character (odd backslash run before it) is part of the token,
// not a separator.
export function tokenAt(line: string, caret: number): { start: number; end: number; text: string } {
  let start = caret
  while (start > 0 && !isSeparator(line, start - 1)) start--
  let end = caret
  while (end < line.length && !isSeparator(line, end)) end++
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
// `~` stays here because it's only unsafe at word start (see escapeArg); `=`
// has the same zsh-only EQUALS-expansion quirk at word start, but it's far
// rarer in filenames and escaping it would churn this set for a case bash
// itself doesn't handle either, so it's left alone.
const SAFE = /[A-Za-z0-9@%+=:,./_~-]/

// Backslash-escape every character outside SAFE, plus a leading `~` (bash/zsh
// tilde-expand a `~` at word start, so a candidate literally named `~foo`
// would otherwise resolve to a home directory instead of the file — a wrong
// path, not an injection, since tilde expansion can't run a command). This is
// what bash/zsh do for filename completion, and unlike shellQuote's wrapping
// it keeps the caret directly adjacent to the candidate's own text —
// important for a directory candidate, where a trailing quote character would
// sit between the caret and the path and break "the next Tab descends into it".
export function escapeArg(s: string): string {
  return Array.from(s)
    .map((ch, i) => (SAFE.test(ch) && !(i === 0 && ch === '~') ? ch : `\\${ch}`))
    .join('')
}

// Inverse of escapeArg, for turning what sits in the compose line back into
// the literal prefix a later Tab (or the remote probe) should match against.
// Strips a leading quote and a matching trailing one first, then drops a
// backslash before any character (including a line terminator, so a `\` +
// newline pair that escapeArg produced round-trips too). The quote-strip must
// run before the backslash pass: doing it after would strip an *escaped*
// quote (`\'q\'`, unescape → `'q'`) as if the user had typed it bare, losing
// the quote characters that are actually part of the name.
export function unescapeArg(s: string): string {
  const quote = s[0]
  const isQuoted = quote === "'" || quote === '"'
  const hasMatchingTail = isQuoted && s.length > 1 && s[s.length - 1] === quote
  const body = isQuoted ? (hasMatchingTail ? s.slice(1, -1) : s.slice(1)) : s
  return body.replace(/\\([\s\S])/g, '$1')
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
