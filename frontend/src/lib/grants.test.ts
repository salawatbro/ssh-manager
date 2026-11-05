import { describe, expect, it } from 'vitest'
import { GrantLength, type Grant } from '@bindings/github.com/salawat/sshmgr/internal/agent'
import { grantClient, grantLeft, openGrants } from './grants'

const NOW = Date.parse('2026-11-05T12:00:00Z')

function grant(p: Partial<Grant> = {}): Grant {
  return {
    id: 'g1', keyId: 'k1', keyName: 'deploy', fingerprint: 'SHA256:x', app: 'iTerm', chain: 'ssh ← zsh',
    length: GrantLength.GrantFor15Min, createdAt: '2026-11-05T11:56:00Z', expiresAt: '2026-11-05T12:11:00Z', uses: 0, ...p,
  }
}

describe('grants', () => {
  it('drops approvals that ran out', () => {
    const list = [grant(), grant({ id: 'g2', expiresAt: '2026-11-05T11:59:00Z' }), grant({ id: 'g3', expiresAt: null })]
    expect(openGrants(list, NOW).map((g) => g.id)).toEqual(['g1', 'g3'])
  })

  it('says how long is left', () => {
    expect(grantLeft(grant(), NOW)).toBe('11 min left')
    expect(grantLeft(grant({ expiresAt: '2026-11-05T12:00:30Z' }), NOW)).toBe('less than a minute left')
    expect(grantLeft(grant({ expiresAt: null, length: GrantLength.GrantUntilLock }), NOW)).toBe('until Zish locks')
  })

  it('names the app, then what ran in it', () => {
    expect(grantClient(grant())).toBe('iTerm · ssh ← zsh')
    expect(grantClient(grant({ app: 'Zish', chain: 'tunnel' }))).toBe('Zish · tunnel')
    expect(grantClient(grant({ app: 'tmux', chain: '' }))).toBe('tmux')
    expect(grantClient(grant({ app: '', chain: '' }))).toBe('Unknown app')
  })
})
