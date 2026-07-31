import { describe, expect, it } from 'vitest'
import { splitLinks } from './links'
import type { Segment } from './types'

const seg = (text: string, cls = 'tc-fg'): Segment => ({ text, cls })
const joined = (line: Segment[]) => line.map((s) => s.text).join('')

describe('splitLinks', () => {
  it('leaves a line with no URL untouched (same refs)', () => {
    const line = [seg('total 8'), seg('file.txt')]
    expect(splitLinks(line)).toBe(line)
  })

  it('splits a URL in the middle of a segment into three parts', () => {
    const out = splitLinks([seg('see https://example.com now')])
    expect(out.map((s) => s.text)).toEqual(['see ', 'https://example.com', ' now'])
    expect(joined(out)).toBe('see https://example.com now')
    const link = out.find((s) => s.link)
    expect(link?.link).toEqual({ kind: 'url', target: 'https://example.com' })
    expect(link?.cls).toContain('tc-lnk')
  })

  it('trims trailing sentence punctuation out of the link', () => {
    const out = splitLinks([seg('visit https://example.com/path.')])
    expect(out.find((s) => s.link)?.link?.target).toBe('https://example.com/path')
    expect(joined(out)).toBe('visit https://example.com/path.')
  })

  it('keeps a matched URL segment’s original colour class and adds tc-lnk', () => {
    const out = splitLinks([seg('https://a.co', 'tc-blu tc-bold')])
    const link = out.find((s) => s.link)!
    expect(link.cls).toBe('tc-blu tc-bold tc-lnk')
  })

  it('detects two URLs on one line', () => {
    const out = splitLinks([seg('http://a.co and http://b.co')])
    expect(out.filter((s) => s.link).map((s) => s.link!.target)).toEqual(['http://a.co', 'http://b.co'])
    expect(joined(out)).toBe('http://a.co and http://b.co')
  })

  it('does not link a bare www or scheme-less host', () => {
    const out = splitLinks([seg('go to www.example.com')])
    expect(out.some((s) => s.link)).toBe(false)
  })

  it('does not link an already-linked segment again', () => {
    const pre: Segment[] = [{ text: 'https://a.co', cls: 'tc-lnk', link: { kind: 'url', target: 'https://a.co' } }]
    expect(splitLinks(pre)).toBe(pre)
  })

  it('links the whole URL when it is split across two same-cls adjacent segments', () => {
    const line = [seg('see https://exa'), seg('mple.com now')]
    const out = splitLinks(line)
    expect(joined(out)).toBe('see https://example.com now')
    const link = out.find((s) => s.link)
    expect(link?.link).toEqual({ kind: 'url', target: 'https://example.com' })
  })

  it('does not join a URL split across segments with different cls', () => {
    // Deliberately out of scope: a styling change mid-URL is treated as a
    // hard boundary, so each half is matched independently.
    const line = [seg('see https://exa', 'tc-fg'), seg('mple.com now', 'tc-blu')]
    const out = splitLinks(line)
    expect(out.filter((s) => s.link).map((s) => s.link!.target)).toEqual(['https://exa'])
    expect(joined(out)).toBe('see https://example.com now')
  })

  it('returns the same array reference when two same-cls segments have no URL', () => {
    const line = [seg('no link '), seg('here at all')]
    expect(splitLinks(line)).toBe(line)
  })

  it('does not produce a leading space in the link class when cls is empty', () => {
    const out = splitLinks([seg('https://a.co', '')])
    const link = out.find((s) => s.link)!
    expect(link.cls).toBe('tc-lnk')
  })

  it('links both URLs and reproduces the original text exactly when a trim is involved', () => {
    const out = splitLinks([seg('https://a.co, https://b.co.')])
    expect(out.filter((s) => s.link).map((s) => s.link!.target)).toEqual(['https://a.co', 'https://b.co'])
    expect(joined(out)).toBe('https://a.co, https://b.co.')
  })

  it('leaves a non-matching segment untouched by reference on a mixed line', () => {
    // Different cls on the first segment keeps it in its own run (per the
    // run-grouping rule), so it is unrelated to the second segment's match
    // and its identity must survive untouched.
    const line = [seg('plain', 'tc-dim'), seg('see https://a.co')]
    const out = splitLinks(line)
    expect(out[0]).toBe(line[0])
    expect(out.some((s) => s.link)).toBe(true)
  })

  it('still links a URL whose scheme colon and slashes are split across a chunk boundary', () => {
    // The pre-check in splitRun tests for a lone ':' (not '://'), specifically
    // so this case — the split falling right at the scheme boundary — is not
    // skipped before the join that coalesces it.
    const line = [seg('see https:'), seg('//a.co now')]
    const out = splitLinks(line)
    expect(joined(out)).toBe('see https://a.co now')
    const link = out.find((s) => s.link)
    expect(link?.link).toEqual({ kind: 'url', target: 'https://a.co' })
  })

  it('excludes a bidi override character from the linked target', () => {
    // U+202E (right-to-left override) could otherwise make the rendered link
    // text read as a different host than the one actually opened.
    const url = 'https://a.co/‮evil'
    const out = splitLinks([seg(`visit ${url} now`)])
    const link = out.find((s) => s.link)!
    expect(link.link!.target).toBe('https://a.co/')
    expect(link.link!.target).not.toContain('‮')
  })
})
