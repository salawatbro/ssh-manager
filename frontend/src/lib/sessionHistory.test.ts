import { describe, it, expect } from 'vitest'
import type { SessionLog } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { formatSession } from './sessionHistory'

const log = (over: Partial<SessionLog>): SessionLog => ({
  id: 1,
  serverId: 's1',
  startedAt: '2026-07-29T09:22:00Z',
  endedAt: null,
  outcome: '',
  ...over,
})

describe('formatSession', () => {
  it('shows a closed session with its real span', () => {
    const row = formatSession(log({ endedAt: '2026-07-29T10:26:00Z', outcome: 'closed' }))
    expect(row.duration).toBe('1h 04m')
    expect(row.result).toBe('closed')
    expect(row.failed).toBe(false)
  })

  it('marks a dropped session failed, still with its real duration', () => {
    const row = formatSession(log({ endedAt: '2026-07-29T09:28:00Z', outcome: 'dropped' }))
    expect(row.duration).toBe('6m')
    expect(row.result).toBe('dropped')
    expect(row.failed).toBe(true)
  })

  it('computes an open session’s duration live, against the injected now', () => {
    const now = new Date('2026-07-29T09:52:00Z').getTime()
    const row = formatSession(log({ endedAt: null, outcome: '' }), now)
    expect(row.result).toBe('open')
    expect(row.duration).toBe('30m')
    expect(row.failed).toBe(false)
  })

  it('floors a sub-minute span to 0m rather than a negative or blank', () => {
    const row = formatSession(log({ startedAt: '2026-07-29T09:22:00Z', endedAt: '2026-07-29T09:22:40Z', outcome: 'closed' }))
    expect(row.duration).toBe('0m')
  })
})
