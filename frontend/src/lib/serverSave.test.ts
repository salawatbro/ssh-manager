import { describe, expect, it, vi } from 'vitest'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { emptyServerForm } from './serverDraft'
import { saveServerDraft, type ServerSaveDeps } from './serverSave'

function deps(over: Partial<ServerSaveDeps> = {}): ServerSaveDeps {
  return {
    create: vi.fn(async () => ({ id: 'new' }) as Server),
    update: vi.fn(async () => null),
    installKey: vi.fn(async () => null),
    ...over,
  }
}

const zish = { ...emptyServerForm(), host: 'db', user: 'u', authType: AuthType.AuthZishKey as AuthType, agentKeyId: 'k1' }

describe('saveServerDraft', () => {
  it('creates, then puts the key on the new server with the one-time password', async () => {
    const d = deps()
    const r = await saveServerDraft(null, zish, true, 'pw', d)
    expect(r).toEqual({ id: 'new', error: null, installed: true })
    expect(d.installKey).toHaveBeenCalledWith('k1', 'new', 'pw')
  })

  it('updates a saved server and skips the key when not asked', async () => {
    const d = deps()
    const r = await saveServerDraft('s1', zish, false, '', d)
    expect(r).toEqual({ id: 's1', error: null, installed: false })
    expect(d.update).toHaveBeenCalledWith('s1', expect.objectContaining({ host: 'db', agentKeyId: 'k1' }))
    expect(d.installKey).not.toHaveBeenCalled()
  })

  it('stops before saving when the password for the key is missing', async () => {
    const d = deps()
    const r = await saveServerDraft(null, zish, true, '', d)
    expect(r.error).toMatch(/password/)
    expect(d.create).not.toHaveBeenCalled()
  })

  it('reports a failed create without an id', async () => {
    const r = await saveServerDraft(null, zish, true, 'pw', deps({ create: async () => 'Host must be …' }))
    expect(r).toEqual({ id: null, error: 'Host must be …', installed: false })
  })

  it('keeps the new id when only the key step fails', async () => {
    const r = await saveServerDraft(null, zish, true, 'pw', deps({ installKey: async () => 'auth failed' }))
    expect(r).toEqual({ id: 'new', error: 'Saved, but the key wasn’t added: auth failed', installed: false })
  })

  it('never installs for a server that does not use a Zish key', async () => {
    const d = deps()
    await saveServerDraft(null, { ...zish, authType: AuthType.AuthAgent }, true, '', d)
    expect(d.installKey).not.toHaveBeenCalled()
  })
})
