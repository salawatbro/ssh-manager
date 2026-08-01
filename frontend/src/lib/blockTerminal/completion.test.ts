import { describe, expect, it } from 'vitest'
import { applyCompletion, escapeArg, shellQuote, tokenAt, unescapeArg } from './completion'

describe('tokenAt', () => {
  it('takes the whitespace-delimited token containing the caret', () => {
    expect(tokenAt('ls src/fo', 9)).toEqual({ start: 3, end: 9, text: 'src/fo' })
  })
  it('takes the token the caret sits inside, not the whole line', () => {
    expect(tokenAt('cat a.txt b.txt', 5)).toEqual({ start: 4, end: 9, text: 'a.txt' })
  })
  it('returns an empty token after a trailing space', () => {
    expect(tokenAt('ls ', 3)).toEqual({ start: 3, end: 3, text: '' })
  })
  it('handles an empty line', () => {
    expect(tokenAt('', 0)).toEqual({ start: 0, end: 0, text: '' })
  })
  it('handles the caret at the start of the line', () => {
    expect(tokenAt('ls', 0)).toEqual({ start: 0, end: 2, text: 'ls' })
  })
  it('treats a backslash-escaped space as part of the token, not a separator', () => {
    expect(tokenAt('ls my\\ dir/', 11)).toEqual({ start: 3, end: 11, text: 'my\\ dir/' })
  })
  it('treats a space after an escaped backslash as a real separator', () => {
    // The two backslashes are an escaped backslash (even count), so the
    // space that follows is unescaped and still splits the line.
    expect(tokenAt('ls a\\\\ b', 8)).toEqual({ start: 7, end: 8, text: 'b' })
  })
})

describe('shellQuote', () => {
  it('wraps in single quotes', () => {
    expect(shellQuote('src/foo')).toBe("'src/foo'")
  })
  it('escapes an embedded single quote', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })
  // The prefix is interpolated into a command the remote shell runs. A naive
  // implementation lets this break out of the quotes and execute `id`.
  it('neutralises a quote-escape injection attempt', () => {
    const out = shellQuote("'; id; '")
    expect(out.startsWith("'")).toBe(true)
    expect(out.endsWith("'")).toBe(true)
    // No bare single quote survives: every one is part of the '\'' sequence.
    expect(out.slice(1, -1).split("'\\''").join('')).not.toContain("'")
  })
  it('leaves other metacharacters alone — single quotes already neuter them', () => {
    expect(shellQuote('a b$c;d`e')).toBe("'a b$c;d`e'")
  })
})

describe('escapeArg / unescapeArg', () => {
  it('leaves a plain name untouched, both directions', () => {
    expect(escapeArg('src/foo.ts')).toBe('src/foo.ts')
    expect(unescapeArg('src/foo.ts')).toBe('src/foo.ts')
  })
  it('backslash-escapes a shell metacharacter', () => {
    expect(escapeArg('a;id.txt')).toBe('a\\;id.txt')
  })
  it('backslash-escapes an embedded single quote', () => {
    expect(escapeArg("o'clock.txt")).toBe("o\\'clock.txt")
  })
  it('backslash-escapes a space', () => {
    expect(escapeArg('my file.txt')).toBe('my\\ file.txt')
  })
  it('backslash-escapes a mix of $, backtick, |, &, ( and )', () => {
    expect(escapeArg('a$b`c|d&e(f)t.txt')).toBe('a\\$b\\`c\\|d\\&e\\(f\\)t.txt')
  })
  it('escapes a leading tilde (bash/zsh tilde-expand at word start)', () => {
    expect(escapeArg('~foo')).toBe('\\~foo')
  })
  it('leaves a mid-word tilde bare (tilde expansion only triggers at word start)', () => {
    expect(escapeArg('a~b')).toBe('a~b')
  })
  it('round-trips every hostile name through escapeArg then unescapeArg', () => {
    for (const name of ['a;id.txt', "o'clock.txt", 'my file.txt', 'a$b`c|d&e(f)t.txt', '~foo']) {
      expect(unescapeArg(escapeArg(name))).toBe(name)
    }
  })
  it('round-trips a name that begins and ends with a quote character', () => {
    // Regression: stripping quotes after unescaping would mistake the
    // escaped quotes for user-typed wrapping quotes and drop them.
    expect(unescapeArg(escapeArg("'q'"))).toBe("'q'")
  })
  it('round-trips a name containing a newline', () => {
    // Regression: /\\(.)/g doesn't match a line terminator, so a `\` + LF
    // pair that escapeArg produces would survive the backslash pass intact.
    expect(unescapeArg(escapeArg('a\nb.txt'))).toBe('a\nb.txt')
  })
  it('strips a leading quote the user typed by hand, with no matching tail', () => {
    expect(unescapeArg("'my fi")).toBe('my fi')
  })
  it('strips a matching leading and trailing quote the user typed by hand', () => {
    expect(unescapeArg("'my file.txt'")).toBe('my file.txt')
  })
  it('leaves a plain prefix with no quotes or backslashes alone', () => {
    expect(unescapeArg('plain')).toBe('plain')
  })
})

describe('applyCompletion', () => {
  it('replaces the token and adds a trailing space for a file', () => {
    expect(applyCompletion('ls src/fo', 9, 'src/foo.ts')).toEqual({ line: 'ls src/foo.ts ', caret: 14 })
  })
  it('keeps the caret tight after a directory so the next Tab descends', () => {
    expect(applyCompletion('ls src/', 7, 'src/lib/')).toEqual({ line: 'ls src/lib/', caret: 11 })
  })
  it('preserves text after the token', () => {
    expect(applyCompletion('cat a.t b.txt', 7, 'a.txt')).toEqual({ line: 'cat a.txt b.txt', caret: 10 })
  })
  it('backslash-escapes a candidate containing a space', () => {
    expect(applyCompletion('ls my', 5, 'my file.txt')).toEqual({ line: 'ls my\\ file.txt ', caret: 16 })
  })
  it('escapes a metacharacter instead of splicing it raw into the line', () => {
    expect(applyCompletion('ls a', 4, 'a;id.txt')).toEqual({ line: 'ls a\\;id.txt ', caret: 13 })
  })
  it('keeps a mid-line separator intact when completing a directory (the !isDir guard)', () => {
    // Without the !isDir half of the guard, tailStart would consume the
    // separator space too, fusing 'sub/' directly onto 'b.txt'.
    expect(applyCompletion('cat a.t b.txt', 7, 'sub/')).toEqual({ line: 'cat sub/ b.txt', caret: 8 })
  })
  it('preserves a multi-space separator exactly', () => {
    expect(applyCompletion('cat a.t   b.txt', 7, 'a.txt')).toEqual({ line: 'cat a.txt   b.txt', caret: 10 })
  })
  it('normalises a tab separator to a single space (shell-equivalent after word splitting)', () => {
    // tokenAt treats the tab as whitespace, so it's consumed as the
    // pre-existing separator and replaced by the completion's own trailing
    // space — this is documenting current behaviour, not asserting a
    // requirement that the tab be preserved literally.
    expect(applyCompletion('cat a.t\tb.txt', 7, 'a.txt')).toEqual({ line: 'cat a.txt b.txt', caret: 10 })
  })
  it('round-trips a directory name with a space through complete, re-tokenize and unescape', () => {
    // This is the point of the tokenAt/escapeArg/unescapeArg fixes together:
    // completing into a space-containing name must leave the compose line in
    // a state where the *next* Tab recovers the same literal name.
    const applied = applyCompletion('ls ', 3, 'my dir/')
    expect(applied).toEqual({ line: 'ls my\\ dir/', caret: 11 })
    const token = tokenAt(applied.line, applied.caret)
    expect(token.text).toBe('my\\ dir/')
    expect(unescapeArg(token.text)).toBe('my dir/')
  })
})
