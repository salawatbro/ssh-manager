import { describe, expect, it } from 'vitest'
import { applyCompletion, shellQuote, tokenAt } from './completion'

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
  it('quotes a candidate containing a space', () => {
    expect(applyCompletion('ls my', 5, 'my file.txt')).toEqual({ line: "ls 'my file.txt' ", caret: 17 })
  })
})
