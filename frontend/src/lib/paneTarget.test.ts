import { describe, it, expect } from 'vitest'
import { LOCAL_TARGET_ID, isLocalTarget } from './paneTarget'

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
