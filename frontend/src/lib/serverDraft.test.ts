import { describe, expect, it } from 'vitest'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { parseSshCommand } from './sshCommand'
import { applyPaste, emptyServerForm, routeTarget, serverDraftError, serverFormFrom, serverInput } from './serverDraft'

const servers = [{ id: 'b1', name: 'bastion', host: '10.0.0.1', user: 'ops', port: 22 }] as Server[]
const detected = [{ path: '/Users/me/.ssh/id_ed25519' }]

describe('applyPaste', () => {
  it('fills the board example and finds the saved jump host', () => {
    const { form, unknownJump } = applyPaste(emptyServerForm(), parseSshCommand('ssh -p 2222 deploy@10.20.1.14 -J bastion'), servers, detected)
    expect(form).toMatchObject({ user: 'deploy', host: '10.20.1.14', port: 2222, jumpId: 'b1' })
    expect(unknownJump).toBe('')
  })

  it('reports a jump host Zish does not know', () => {
    const { form, unknownJump } = applyPaste(emptyServerForm(), parseSshCommand('ssh -J edge web'), servers, detected)
    expect(form.jumpId).toBeNull()
    expect(unknownJump).toBe('edge')
  })

  it('resets the port and jump a new host leaves out', () => {
    const before = { ...emptyServerForm(), host: 'old', port: 2200 as const, jumpId: 'b1' }
    const { form } = applyPaste(before, parseSshCommand('ssh root@new'), servers, detected)
    expect(form).toMatchObject({ host: 'new', user: 'root', port: '', jumpId: null })
  })

  it('switches to a key file and resolves ~ against detected keys', () => {
    const { form } = applyPaste(emptyServerForm(), parseSshCommand('ssh -i ~/.ssh/id_ed25519 web'), servers, detected)
    expect(form.authType).toBe(AuthType.AuthKey)
    expect(form.keyPath).toBe('/Users/me/.ssh/id_ed25519')
  })

  it('leaves the form alone for an unreadable command', () => {
    const f = { ...emptyServerForm(), host: 'keep' }
    expect(applyPaste(f, parseSshCommand('ssh'), servers, detected).form).toEqual(f)
  })
})

describe('serverInput', () => {
  it('names the server after its host when the name is blank, and sends port 0 for "default"', () => {
    const input = serverInput({ ...emptyServerForm(), host: ' web-01 ', user: 'u' })
    expect(input.name).toBe('web-01')
    expect(input.port).toBe(0)
  })

  it('carries every field of a saved server through', () => {
    const s = {
      id: 's', name: 'api', host: 'h', port: 2222, user: 'u', authType: AuthType.AuthKey, keyPath: '/k', agentKeyId: null,
      twoFactor: true, group: 'Prod', environment: 'prod', tags: 'a,b', notes: 'n', jumpId: 'b1', icon: 'rocket',
      color: 'orange', runAfterConnect: 'tmux', terminal: 'iterm2',
    } as unknown as Server
    expect(serverInput(serverFormFrom(s))).toMatchObject({
      name: 'api', port: 2222, tags: ['a', 'b'], icon: 'rocket', color: 'orange', runAfterConnect: 'tmux', terminal: 'iterm2',
      password: '', passphrase: '', totpSecret: '',
    })
  })
})

describe('serverDraftError', () => {
  const zish = { ...emptyServerForm(), authType: AuthType.AuthZishKey as AuthType }

  it('needs a key, and a password when the key is to be installed', () => {
    expect(serverDraftError(zish, false, '')).toMatch(/Zish key/)
    expect(serverDraftError({ ...zish, agentKeyId: 'k1' }, true, '')).toMatch(/password/)
    expect(serverDraftError({ ...zish, agentKeyId: 'k1' }, true, 'pw')).toBeNull()
    expect(serverDraftError(emptyServerForm(), true, '')).toBeNull()
  })
})

describe('routeTarget', () => {
  it('shows the port only off 22', () => {
    expect(routeTarget(emptyServerForm())).toBe('host')
    expect(routeTarget({ ...emptyServerForm(), host: 'db', port: 22 })).toBe('db')
    expect(routeTarget({ ...emptyServerForm(), host: 'db', port: 2222 })).toBe('db:2222')
  })
})
