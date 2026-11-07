import { describe, expect, it } from 'vitest'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyAge, keyChips, keyNeedsCare, rotateDue, serversUsingKey } from './keyCards'

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

describe('keyChips', () => {
  it('matches the board', () => {
    const users = [server('1', 'web', 'k1'), server('2', 'api', 'k1'), server('3', 'db', 'k1')]
    expect(keyChips(key(), users, NOW)).toEqual([
      { label: 'Touch ID', tone: 'acc' },
      { label: '3 servers', tone: 'plain' },
      { label: '8 months old', tone: 'plain' },
    ])
    expect(keyChips(key({ requireConfirm: false, createdAt: daysAgo(800) }), [], NOW)).toEqual([
      { label: 'no Touch ID', tone: 'warn' },
      { label: 'never used', tone: 'plain' },
      { label: '2 years old · rotate', tone: 'warn' },
    ])
    expect(keyChips(key({ lastUsedAt: daysAgo(1) }), [users[0]], NOW)[1]).toEqual({ label: 'web', tone: 'plain' })
  })

  it('marks keys that need care', () => {
    expect(keyNeedsCare(key(), NOW)).toBe(false)
    expect(keyNeedsCare(key({ requireConfirm: false }), NOW)).toBe(true)
    expect(keyNeedsCare(key({ type: 'ssh-rsa' }), NOW)).toBe(true)
    expect(keyNeedsCare(key({ createdAt: daysAgo(400) }), NOW)).toBe(true)
  })
})
