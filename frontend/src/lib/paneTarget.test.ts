import { describe, it, expect } from 'vitest'
import { LOCAL_TARGET_ID, isLocalTarget, resolveBarServerId } from './paneTarget'

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

describe('resolveBarServerId', () => {
  it('uses the active tab server id when it is a real server', () => {
    expect(resolveBarServerId({ serverId: 'server-1' }, 'server-2')).toBe('server-1')
  })

  // The regression this guards: a local tab's sentinel must never be handed
  // to ForwardService.List as if it were a real server id.
  it('never returns the local sentinel, even as the active tab', () => {
    expect(resolveBarServerId({ serverId: LOCAL_TARGET_ID }, 'server-2')).toBe('server-2')
    expect(resolveBarServerId({ serverId: LOCAL_TARGET_ID }, null)).toBe(null)
  })

  it('falls back to the selected id when there is no active tab', () => {
    expect(resolveBarServerId(null, 'server-2')).toBe('server-2')
    expect(resolveBarServerId(null, null)).toBe(null)
  })
})
