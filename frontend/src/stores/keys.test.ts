import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'

const svc = vi.hoisted(() => ({
  ListKeys: vi.fn(),
  Status: vi.fn(),
  Generate: vi.fn(),
  Import: vi.fn(),
  Rename: vi.fn(),
  SetRequireConfirm: vi.fn(),
  Delete: vi.fn(),
}))
const handlers = vi.hoisted(() => ({} as Record<string, (ev: { data: unknown }) => void>))

vi.mock('@bindings/github.com/salawat/sshmgr/internal/service', () => ({ AgentService: svc }))
vi.mock('@wailsio/runtime', () => ({
  Events: {
    On: (name: string, fn: (ev: { data: unknown }) => void) => {
      handlers[name] = fn
      return () => delete handlers[name]
    },
  },
}))

import { useKeys } from './keys'

function key(id: string, name: string): AgentKey {
  return {
    id, name, type: 'ssh-ed25519', bits: 0, fingerprint: `SHA256:${id}`, publicKey: 'ssh-ed25519 AAAA',
    comment: '', requireConfirm: true, createdAt: '', lastUsedAt: null,
  } as AgentKey
}

beforeEach(() => {
  vi.clearAllMocks()
  useKeys.setState({ keys: [], status: null, selectedId: null })
})

describe('useKeys', () => {
  it('refresh loads keys and status and selects the first key', async () => {
    svc.ListKeys.mockResolvedValue([key('a', 'alpha'), key('b', 'beta')])
    svc.Status.mockResolvedValue({ enabled: true, running: true, socketPath: '/s', error: '', clientLocked: false, tempKeys: [] })
    await useKeys.getState().refresh()
    expect(useKeys.getState().keys.map((k) => k.id)).toEqual(['a', 'b'])
    expect(useKeys.getState().selectedId).toBe('a')
    expect(useKeys.getState().status?.running).toBe(true)
  })

  it('generate inserts in name order and selects the new key', async () => {
    useKeys.setState({ keys: [key('a', 'alpha'), key('c', 'gamma')] })
    svc.Generate.mockResolvedValue(key('b', 'Beta'))
    const res = await useKeys.getState().generate({ name: 'Beta', type: 'ed25519', comment: '', requireConfirm: true })
    expect(typeof res).toBe('object')
    expect(useKeys.getState().keys.map((k) => k.id)).toEqual(['a', 'b', 'c'])
    expect(useKeys.getState().selectedId).toBe('b')
  })

  it('returns the backend message on failure', async () => {
    svc.Import.mockRejectedValue(new Error('Wrong passphrase for this key.'))
    const res = await useKeys.getState().importKey({ path: '/k', passphrase: 'x', name: '', requireConfirm: true })
    expect(res).toBe('Wrong passphrase for this key.')
    svc.Delete.mockRejectedValue(new Error('Used by db.'))
    expect(await useKeys.getState().remove('a')).toBe('Used by db.')
  })

  it('remove drops the key and moves the selection', async () => {
    useKeys.setState({ keys: [key('a', 'alpha'), key('b', 'beta')], selectedId: 'a' })
    svc.Delete.mockResolvedValue(undefined)
    expect(await useKeys.getState().remove('a')).toBeNull()
    expect(useKeys.getState().keys.map((k) => k.id)).toEqual(['b'])
    expect(useKeys.getState().selectedId).toBe('b')
  })

  it('agent:status updates the status', () => {
    const off = useKeys.getState().listen()
    handlers['agent:status']({ data: { enabled: true, running: false, socketPath: '', error: 'busy', clientLocked: true, tempKeys: [] } })
    expect(useKeys.getState().status?.clientLocked).toBe(true)
    off()
  })
})
