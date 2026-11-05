import { describe, expect, it } from 'vitest'
import type { SecurityCheck, SecurityReport } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { checkedLabel, fixFor, openCount, segments, splitChecks, verdict, withIgnored, type LockContext } from './security'

const check = (id: string, over: Partial<SecurityCheck> = {}): SecurityCheck => ({
  id, ok: false, ignored: false, title: id, detail: '', items: [], notes: [], ...over,
})
const item = (name: string) => ({ kind: 'server', id: name, name })
const report = (checks: SecurityCheck[]): SecurityReport => ({
  score: checks.filter((c) => c.ok).length, total: 10, checks, checkedAt: '',
})
const lockOn: LockContext = { hasPin: true, lockEnabled: true, biometricsAvailable: true }
const lockOff: LockContext = { hasPin: false, lockEnabled: false, biometricsAvailable: true }

describe('fixFor', () => {
  it.each([
    ['password-servers', 2, 'move-to-key'],
    ['jump-keys', 1, 'move-to-key'],
    ['keys-touch-id', 3, 'require-touch-id'],
    ['key-age', 1, 'open-key'],
    ['key-age', 2, 'show-keys'],
    ['rsa-keys', 1, 'open-key'],
    ['prod-two-factor', 1, 'edit-server'],
    ['prod-two-factor', 2, null],
    ['known-hosts', 1, 'show-server'],
    ['known-hosts', 4, null],
    ['agent-socket', 0, 'open-settings-keys'],
  ])('%s with %i items → %s', (id, n, kind) => {
    const c = check(id, { items: Array.from({ length: n }, (_, i) => item(`s${i}`)) })
    expect(fixFor(c, lockOn)?.kind ?? null).toBe(kind)
  })

  it('fixes the lock inline only once a PIN locks Zish', () => {
    expect(fixFor(check('app-lock'), lockOn)).toEqual({ kind: 'use-touch-id', label: 'Use Touch ID' })
    expect(fixFor(check('app-lock'), { ...lockOn, biometricsAvailable: false })?.kind).toBe('open-settings-lock')
    expect(fixFor(check('app-lock'), lockOff)?.kind).toBe('open-settings-lock')
    expect(fixFor(check('idle-lock'), lockOn)).toEqual({ kind: 'idle-lock', label: 'Lock after 10 minutes' })
    expect(fixFor(check('idle-lock'), { ...lockOn, lockEnabled: false })?.kind).toBe('open-settings-lock')
  })

  it('has nothing for an unknown check', () => {
    expect(fixFor(check('later'), lockOn)).toBeNull()
  })
})

describe('splitChecks', () => {
  const r = report([
    check('a'),
    check('b', { ok: true }),
    check('c', { ignored: true }),
    check('d', { ok: true }),
  ])

  it('sorts open, passing and ignored checks', () => {
    const v = splitChecks(r)
    expect(v.issues.map((i) => i.check.id)).toEqual(['a'])
    expect(v.passing.map((c) => c.id)).toEqual(['b', 'd'])
    expect(v.ignored.map((c) => c.id)).toEqual(['c'])
    expect(v.open).toBe(1)
  })

  it('keeps a just-fixed check as a ticked issue with its old card', () => {
    const before = check('d', { title: 'legacy-rsa signs without Touch ID' })
    const v = splitChecks(r, { d: { check: before, text: 'Asks for Touch ID now' } })
    expect(v.issues).toEqual([
      { check: r.checks![0], doneText: null },
      { check: before, doneText: 'Asks for Touch ID now' },
    ])
    expect(v.passing.map((c) => c.id)).toEqual(['b'])
    expect(v.open).toBe(1)
  })

  it('shows a fix that did not take as still open', () => {
    expect(splitChecks(r, { a: { check: check('a'), text: 'done' } }).issues[0].doneText).toBeNull()
  })

  it('handles no report', () => {
    expect(splitChecks(null)).toEqual({ issues: [], passing: [], ignored: [], open: 0 })
  })
})

describe('openCount', () => {
  it('counts failing checks that are not ignored', () => {
    expect(openCount(report([check('a'), check('b', { ignored: true }), check('c', { ok: true })]))).toBe(1)
    expect(openCount(null)).toBe(0)
  })
})

describe('verdict', () => {
  it('says how many things are left', () => {
    expect(verdict(3, 0)).toEqual({ text: '3 things to fix', tone: 'warn' })
    expect(verdict(1, 2)).toEqual({ text: '1 thing to fix', tone: 'warn' })
    expect(verdict(0, 2)).toEqual({ text: 'Nothing left to fix · 2 ignored', tone: 'ok' })
    expect(verdict(0, 0)).toEqual({ text: 'Everything checks out', tone: 'ok' })
  })
})

describe('segments', () => {
  it('fills one segment per passing check', () => {
    expect(segments(7, 10)).toEqual([true, true, true, true, true, true, true, false, false, false])
    expect(segments(0, 0)).toEqual([])
  })
})

describe('withIgnored', () => {
  it('adds and removes ids once', () => {
    expect(withIgnored('', 'key-age', true)).toBe('key-age')
    expect(withIgnored('key-age', 'key-age', true)).toBe('key-age')
    expect(withIgnored('rsa-keys, key-age', 'rsa-keys', false)).toBe('key-age')
    expect(withIgnored('rsa-keys', 'app-lock', false)).toBe('rsa-keys')
  })
})

describe('checkedLabel', () => {
  it('reads the report time', () => {
    expect(checkedLabel(new Date().toISOString())).toBe('Checked just now')
    expect(checkedLabel(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('Checked 5m ago')
    expect(checkedLabel(undefined)).toBe('Not checked yet')
  })
})
