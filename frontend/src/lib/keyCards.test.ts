import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyAge, keyFacts, keyNeedsCare, rotateDue, serverList, serversUsingKey } from './keyCards'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function key(p: Partial<AgentKey> = {}): AgentKey {
  return {
    id: 'k1', name: 'deploy', type: 'ssh-ed25519', bits: 0, fingerprint: 'SHA256:x', publicKey: 'ssh-ed25519 AAA',
    comment: '', requireConfirm: true, createdAt: daysAgo(240), lastUsedAt: null, ...p,
  }
}

function server(id: string, name: string, keyId: string | null, auth = AuthType.AuthZishKey): Server {
  return { id, name, authType: auth, agentKeyId: keyId } as Server
}

describe('serversUsingKey', () => {
  it('keeps Zish-key servers on this key, by name', () => {
    const list = [server('1', 'web', 'k1'), server('2', 'api', 'k1'), server('3', 'db', 'k2'), server('4', 'old', 'k1', AuthType.AuthAgent)]
    expect(serversUsingKey('k1', list).map((s) => s.name)).toEqual(['api', 'web'])
  })
})

describe('keyAge', () => {
  it('rounds into words', () => {
    expect(keyAge(daysAgo(0), NOW)).toBe('new today')
    expect(keyAge(daysAgo(1), NOW)).toBe('1 day old')
    expect(keyAge(daysAgo(20), NOW)).toBe('2 weeks old')
    expect(keyAge(daysAgo(240), NOW)).toBe('8 months old')
    expect(keyAge(daysAgo(800), NOW)).toBe('2 years old')
    expect(keyAge('nope', NOW)).toBe('')
  })

  it('asks to rotate after a year', () => {
    expect(rotateDue(daysAgo(364), NOW)).toBe(false)
    expect(rotateDue(daysAgo(365), NOW)).toBe(true)
  })

  it('follows the reminder setting; 0 never asks', () => {
    expect(rotateDue(daysAgo(200), NOW, 180)).toBe(true)
    expect(rotateDue(daysAgo(400), NOW, 730)).toBe(false)
    expect(rotateDue(daysAgo(4000), NOW, 0)).toBe(false)
  })
})

describe('serverList', () => {
  it('names two, then counts the rest', () => {
    expect(serverList([])).toBe('')
    expect(serverList(['db-primary'])).toBe('db-primary')
    expect(serverList(['db-primary', 'api-1'])).toBe('db-primary and api-1')
    expect(serverList(['db-primary', 'api-1', 'web'])).toBe('db-primary, api-1 and 1 more')
    expect(serverList(['db-primary', 'api-1', 'web', 'ci'])).toBe('db-primary, api-1 and 2 more')
  })
})

describe('keyFacts', () => {
  // formatRecency reads the wall clock.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString()

  it('matches the board', () => {
    const users = [server('1', 'db-primary', 'k1'), server('2', 'api-1', 'k1'), server('3', 'web', 'k1')]
    expect(keyFacts(key({ lastUsedAt: hoursAgo(2) }), users, NOW)).toEqual({
      touch: { text: 'Asks for Touch ID', tone: 'plain' },
      servers: { text: 'db-primary, api-1 and 1 more', tone: 'plain' },
      age: { text: '8 months old · used 2h ago', tone: 'plain' },
    })
    expect(keyFacts(key({ createdAt: daysAgo(0) }), [], NOW)).toEqual({
      touch: { text: 'Asks for Touch ID', tone: 'plain' },
      servers: { text: 'Not used by a server yet', tone: 'muted' },
      age: { text: 'New today · never used', tone: 'plain' },
    })
  })

  it('warns about a key without Touch ID or due for rotation', () => {
    const f = keyFacts(key({ requireConfirm: false, createdAt: daysAgo(800) }), [server('1', 'old-ci', 'k1')], NOW)
    expect(f.touch).toEqual({ text: 'No Touch ID — any app can use it', tone: 'warn' })
    expect(f.servers).toEqual({ text: 'old-ci', tone: 'plain' })
    expect(f.age).toEqual({ text: '2 years old — time to rotate', tone: 'warn' })
  })

  it('follows the reminder setting', () => {
    expect(keyFacts(key({ createdAt: daysAgo(800) }), [], NOW, 0).age).toEqual({ text: '2 years old · never used', tone: 'plain' })
    expect(keyFacts(key({ createdAt: daysAgo(200) }), [], NOW, 180).age.tone).toBe('warn')
  })

  it('leaves out an unknown age', () => {
    expect(keyFacts(key({ createdAt: 'nope', lastUsedAt: hoursAgo(26) }), [], NOW).age.text).toBe('Used yesterday')
    expect(keyFacts(key({ createdAt: 'nope' }), [], NOW).age.text).toBe('Never used')
  })
})

describe('keyNeedsCare', () => {
  it('marks keys that need care', () => {
    expect(keyNeedsCare(key(), NOW)).toBe(false)
    expect(keyNeedsCare(key({ requireConfirm: false }), NOW)).toBe(true)
    expect(keyNeedsCare(key({ type: 'ssh-rsa' }), NOW)).toBe(true)
    expect(keyNeedsCare(key({ createdAt: daysAgo(400) }), NOW)).toBe(true)
  })
})
