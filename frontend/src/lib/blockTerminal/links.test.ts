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
})
