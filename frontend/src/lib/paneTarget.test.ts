import { describe, it, expect } from 'vitest'
import { LOCAL_TARGET_ID, isLocalTarget, serverTargetId } from './paneTarget'

describe('paneTarget', () => {
  it('recognises the local sentinel', () => {
    expect(isLocalTarget(LOCAL_TARGET_ID)).toBe(true)
  })

  // Real ids come from crypto.randomUUID(), so the sentinel can never collide
  // with a server. This test is the guard on that assumption.
  it('does not recognise a server id', () => {
    expect(isLocalTarget(crypto.randomUUID())).toBe(false)
    expect(isLocalTarget('')).toBe(false)
    expect(isLocalTarget('localhost')).toBe(false)
  })
})

describe('serverTargetId', () => {
  it('returns the tab server id when it is a real server', () => {
    expect(serverTargetId({ serverId: 'server-1' })).toBe('server-1')
  })

  // The regression this guards: a local tab's sentinel must never be handed
  // to ForwardService.List (or anything else) as if it were a real server id.
  it('returns null for the local sentinel', () => {
    expect(serverTargetId({ serverId: LOCAL_TARGET_ID })).toBe(null)
  })

  it('returns null when there is no target at all', () => {
    expect(serverTargetId(null)).toBe(null)
  })
})
