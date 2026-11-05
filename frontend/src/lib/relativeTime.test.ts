import { describe, expect, it } from 'vitest'
import { shortRecency } from './relativeTime'

describe('shortRecency', () => {
  const now = Date.parse('2026-11-05T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const MIN = 60_000

  it.each([
    [null, ''],
    ['garbage', ''],
    [ago(20_000), 'now'],
    [ago(12 * MIN), '12m'],
    [ago(2 * 60 * MIN), '2h'],
    [ago(3 * 24 * 60 * MIN), '3d'],
    [ago(15 * 24 * 60 * MIN), '2w'],
    [ago(150 * 24 * 60 * MIN), '5mo'],
    [ago(400 * 24 * 60 * MIN), '1y'],
  ])('%s → %j', (stamp, want) => {
    expect(shortRecency(stamp, now)).toBe(want)
  })
})
