import { describe, expect, it } from 'vitest'
import { AuthType, Environment, type Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { serverInputWithKey } from './switchServerKey'

describe('serverInputWithKey', () => {
  it('switches only the auth method', () => {
    const s = {
      id: 's1', name: 'db', host: 'db.internal', port: 2222, user: 'deploy', authType: AuthType.AuthPassword,
      keyPath: '~/.ssh/old', agentKeyId: null, jumpId: 'j1', group: 'Prod', environment: Environment.EnvProd,
      tags: 'pg,eu', notes: 'n', icon: 'database', color: 'teal', runAfterConnect: 'htop', terminal: 'iterm',
      twoFactor: true, pinned: true, lastUsedAt: null, useCount: 3, sortOrder: 1,
      createdAt: '', updatedAt: '',
    } as Server
    const input = serverInputWithKey(s, 'k1')
    expect(input).toMatchObject({
      name: 'db', host: 'db.internal', port: 2222, user: 'deploy', authType: AuthType.AuthZishKey,
      keyPath: '', agentKeyId: 'k1', password: '', passphrase: '', totpSecret: '', twoFactor: true,
      jumpId: 'j1', group: 'Prod', environment: Environment.EnvProd, tags: ['pg', 'eu'], notes: 'n',
      icon: 'database', color: 'teal', runAfterConnect: 'htop', terminal: 'iterm',
    })
  })
})
