import { describe, expect, it, vi } from 'vitest'
import { AuthType, type AgentKey, type Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { defaultKeyId, movedToast, moveServersToKey } from './moveToKey'

const key = (id: string, type: string, requireConfirm: boolean) => ({ id, name: id, type, requireConfirm }) as AgentKey
const server = (id: string) =>
  ({ id, name: id, host: `${id}.example`, port: 22, user: 'me', authType: AuthType.AuthPassword, tags: '' }) as Server

describe('defaultKeyId', () => {
  it('prefers ed25519 with Touch ID', () => {
    expect(defaultKeyId([key('rsa', 'ssh-rsa', true), key('ed', 'ssh-ed25519', false), key('best', 'ssh-ed25519', true)])).toBe('best')
    expect(defaultKeyId([key('rsa', 'ssh-rsa', true), key('ed', 'ssh-ed25519', false)])).toBe('ed')
    expect(defaultKeyId([key('rsa', 'ssh-rsa', false), key('ec', 'ecdsa-sha2-nistp256', true)])).toBe('ec')
    expect(defaultKeyId([])).toBe('')
  })
})

describe('moveServersToKey', () => {
  it('installs, then switches each server, one at a time', async () => {
    const calls: string[] = []
    const deps = {
      install: vi.fn(async (k: string, id: string) => {
        calls.push(`install ${k} ${id}`)
      }),
      save: vi.fn(async (id: string, _input: CreateServerInput) => {
        calls.push(`save ${id}`)
        return null
      }),
    }
    const r = await moveServersToKey([server('a'), server('b')], 'k1', deps)
    expect(calls).toEqual(['install k1 a', 'save a', 'install k1 b', 'save b'])
    expect(r.moved.map((s) => s.id)).toEqual(['a', 'b'])
    expect(r.failed).toEqual([])
    expect(deps.save.mock.calls[0][1]).toMatchObject({ authType: AuthType.AuthZishKey, agentKeyId: 'k1', password: '' })
  })

  it('does not switch a server the key never reached, and keeps going', async () => {
    const save = vi.fn(async (id: string) => (id === 'c' ? 'Name taken.' : null))
    const install = vi.fn(async (_k: string, id: string) => {
      if (id === 'a') throw new Error('Permission denied.')
    })
    const r = await moveServersToKey([server('a'), server('b'), server('c')], 'k1', { install, save })
    expect(save.mock.calls.map((c) => c[0])).toEqual(['b', 'c'])
    expect(r.moved.map((s) => s.id)).toEqual(['b'])
    expect(r.failed).toEqual([
      { server: server('a'), error: 'Permission denied.' },
      { server: server('c'), error: 'The key was added, but switching the server failed: Name taken.' },
    ])
  })
})

describe('movedToast', () => {
  it('counts servers', () => {
    expect(movedToast('deploy-ed25519', 3)).toBe('deploy-ed25519 installed on 3 servers')
    expect(movedToast('deploy-ed25519', 1)).toBe('deploy-ed25519 installed on 1 server')
  })
})
