import { describe, it, expect } from 'vitest'
import { buildConnectSteps, type StageEvent } from './connectSteps'

const info = { name: 'web', host: 'example.com', port: 22, authLabel: 'SSH key' }

describe('buildConnectSteps', () => {
  it('labels each step from the server info', () => {
    const steps = buildConnectSteps([], info)
    expect(steps.map((s) => s.label)).toEqual([
      'Resolving web (example.com)',
      'Opening TCP to example.com:22',
      'Verifying host key',
      'Authenticating (SSH key)',
    ])
  })

  it('all pending before any stage arrives', () => {
    expect(buildConnectSteps([], info).every((s) => s.status === 'pending' && s.ms === '')).toBe(true)
  })

  it('marks arrived-then-superseded steps done with the real gap as ms', () => {
    const events: StageEvent[] = [
      { stage: 'resolve', at: 1000 },
      { stage: 'tcp', at: 1012 },
      { stage: 'hostkey', at: 1050 },
    ]
    const steps = buildConnectSteps(events, info)
    expect(steps[0]).toEqual({ label: steps[0].label, status: 'done', ms: '12 ms' })
    expect(steps[1]).toEqual({ label: steps[1].label, status: 'done', ms: '38 ms' })
    // hostkey is the latest arrived → active, no ms yet.
    expect(steps[2].status).toBe('active')
    expect(steps[2].ms).toBe('')
    // auth not arrived, nothing later → pending.
    expect(steps[3].status).toBe('pending')
  })

  it('shows a skipped earlier stage when a later one arrives without it (jumped target)', () => {
    // A jumped connection has no local resolve: tcp arrives first.
    const events: StageEvent[] = [
      { stage: 'tcp', at: 2000 },
      { stage: 'hostkey', at: 2030 },
    ]
    const steps = buildConnectSteps(events, info)
    expect(steps[0].status).toBe('skipped') // resolve
    expect(steps[1].status).toBe('done') // tcp → 30 ms
    expect(steps[1].ms).toBe('30 ms')
    expect(steps[2].status).toBe('active') // hostkey
  })
})
