import { describe, expect, it } from 'vitest'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { authShort, autoFillText, jumpChain, routeNodes } from './route'

function srv(id: string, over: Partial<Server> = {}): Server {
  return { id, name: id, user: 'ops', authType: AuthType.AuthAgent, jumpId: null, twoFactor: false, keyPath: '', agentKeyId: null, ...over } as Server
}

describe('jumpChain', () => {
  it('lists hops root first, target last', () => {
    const bastion = srv('bastion')
    const mid = srv('mid', { jumpId: 'bastion' })
    const db = srv('db', { jumpId: 'mid' })
    expect(jumpChain(db, [db, mid, bastion]).map((s) => s.id)).toEqual(['bastion', 'mid', 'db'])
  })

  it('stops at a missing hop', () => {
    const db = srv('db', { jumpId: 'gone' })
    expect(jumpChain(db, [db]).map((s) => s.id)).toEqual(['db'])
  })

  it('stops at a cycle', () => {
    const a = srv('a', { jumpId: 'b' })
    const b = srv('b', { jumpId: 'a' })
    expect(jumpChain(a, [a, b]).map((s) => s.id)).toEqual(['b', 'a'])
  })
})

describe('routeNodes', () => {
  it('starts at this Mac and marks the target', () => {
    const bastion = srv('bastion', { authType: AuthType.AuthPassword, twoFactor: true })
    const db = srv('db', { user: 'postgres', authType: AuthType.AuthZishKey, agentKeyId: 'k', jumpId: 'bastion' })
    const nodes = routeNodes([bastion, db])
    expect(nodes.map((n) => [n.name, n.sub, n.target])).toEqual([
      ['This Mac', 'Zish agent', false],
      ['bastion', 'ops · password + TOTP', false],
      ['db', 'postgres · Zish key', true],
    ])
  })

  it('names the key file by its base name', () => {
    expect(authShort(srv('w', { authType: AuthType.AuthKey, keyPath: '~/.ssh/id_ed25519' }))).toBe('id_ed25519')
    expect(routeNodes([srv('w')])[0].sub).toBe('ssh client')
  })
})

describe('autoFillText', () => {
  const never = () => false

  it('says when auto-fill is off', () => {
    expect(autoFillText([srv('a', { authType: AuthType.AuthPassword })], false, never)).toMatch(/^Off/)
  })

  it('names each hop that needs a secret', () => {
    const bastion = srv('bastion', { authType: AuthType.AuthPassword, twoFactor: true })
    const db = srv('db', { authType: AuthType.AuthZishKey, agentKeyId: 'k' })
    expect(autoFillText([bastion, db], true, never)).toBe('Password + TOTP for bastion, from Keychain')
    expect(autoFillText([srv('w', { authType: AuthType.AuthKey })], true, never)).toBe('Key passphrase, from Keychain')
  })

  it('mentions Touch ID only for a key that asks for it', () => {
    const db = srv('db', { authType: AuthType.AuthZishKey, agentKeyId: 'k' })
    expect(autoFillText([db], true, (id) => id === 'k')).toBe('Touch ID, then the agent signs')
    expect(autoFillText([db], true, never)).toBe('The Zish agent signs')
    expect(autoFillText([srv('a')], true, never)).toBe('Nothing to fill — ssh-agent signs')
  })
})
