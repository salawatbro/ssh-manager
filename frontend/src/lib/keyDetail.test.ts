import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keyMeta, rotateCadence, rotateDueText } from './keyDetail'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString()

describe('keyMeta', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says type, age and last use', () => {
    expect(keyMeta({ type: 'ssh-ed25519', bits: 0, createdAt: daysAgo(240), lastUsedAt: hoursAgo(2) })).toBe(
      'Ed25519 · 8 months old · used 2h ago',
    )
    expect(keyMeta({ type: 'ssh-rsa', bits: 4096, createdAt: daysAgo(800), lastUsedAt: daysAgo(1) })).toBe(
      'RSA 4096 · 2 years old · used yesterday',
    )
  })

  it('calls a fresh, unused key created today', () => {
    expect(keyMeta({ type: 'ssh-ed25519', bits: 0, createdAt: hoursAgo(3), lastUsedAt: null })).toBe(
      'Ed25519 · created today · never used',
    )
  })

  it('drops an unknown creation date', () => {
    expect(keyMeta({ type: 'ecdsa-sha2-nistp256', bits: 0, createdAt: 'nope', lastUsedAt: null })).toBe('ECDSA P-256 · never used')
  })
})

describe('rotateCadence', () => {
  it('words each reminder choice', () => {
    expect(rotateCadence(180)).toBe('every 6 months')
    expect(rotateCadence(365)).toBe('every year')
    expect(rotateCadence(730)).toBe('every 2 years')
  })

  it('falls back to months, then days', () => {
    expect(rotateCadence(30)).toBe('every month')
    expect(rotateCadence(90)).toBe('every 3 months')
    expect(rotateCadence(45)).toBe('every 45 days')
  })

  it('is null when reminders are off', () => {
    expect(rotateCadence(0)).toBeNull()
  })
})

describe('rotateDueText', () => {
  it('warns once the key is due', () => {
    expect(rotateDueText(daysAgo(240), 180, NOW)).toBe('8 months old — Zish suggests a new key every 6 months.')
    expect(rotateDueText(daysAgo(800), 730, NOW)).toBe('2 years old — Zish suggests a new key every 2 years.')
  })

  it('stays quiet before the reminder', () => {
    expect(rotateDueText(daysAgo(240), 365, NOW)).toBeNull()
  })

  it('never warns with reminders off', () => {
    expect(rotateDueText(daysAgo(4000), 0, NOW)).toBeNull()
  })
})
