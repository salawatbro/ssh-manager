import { describe, expect, it } from 'vitest'
import type { ApprovalRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'
import {
  approvalTitle,
  approveLabel,
  askedBy,
  keysPhrase,
  knownServer,
  lengthNote,
  routeLine,
  serverLine,
  stackHasProd,
  stackTitle,
  toLength,
} from './approval'

function req(p: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'a1', keyName: 'deploy-ed25519', fingerprint: 'SHA256:x', server: 'db-primary', address: 'postgres@10.20.1.30',
    env: 'prod', via: ['bastion'], client: 'ssh', app: 'iTerm2', chain: 'ssh ← zsh ← iTerm2', pid: 8812,
    inProcess: false, forwarded: false, grantable: true, length: '15m', touchId: true, expiresAt: '',
    stack: '', stackServers: null, stackTunnels: null, ...p,
  }
}

describe('approval wording', () => {
  it('matches the board for a saved server', () => {
    const r = req()
    expect(knownServer(r)).toBe(true)
    expect(approvalTitle(r)).toBe('Sign in to db-primary?')
    expect(askedBy(r)).toBe('An ssh in iTerm2 wants to use')
    expect(serverLine(r)).toBe('postgres@10.20.1.30')
    expect(routeLine(r)).toBe('via bastion')
    expect(approveLabel(r)).toBe('Approve with Touch ID')
  })

  it('falls back when the destination is not a Zish server', () => {
    const r = req({ server: 'host key SHA256:abc…', env: '', address: '', via: [] })
    expect(approvalTitle(r)).toBe('Use deploy-ed25519?')
    expect(serverLine(r)).toBe('host key SHA256:abc…')
    expect(routeLine(r)).toBe('')
    expect(serverLine(req({ server: '', env: '' }))).toMatch(/Not known/)
  })

  it('describes Zish itself and other clients', () => {
    expect(askedBy(req({ inProcess: true, chain: 'tunnel' }))).toBe('Zish (tunnel) wants to use')
    expect(askedBy(req({ client: 'git', app: '' }))).toBe('A git wants to use')
    expect(askedBy(req({ client: 'ansible', app: 'Terminal' }))).toBe('An ansible in Terminal wants to use')
    expect(askedBy(req({ client: '', app: '' }))).toBe('An unknown process wants to use')
    expect(routeLine(req({ via: ['b1', 'b2'] }))).toBe('via b1 → b2')
    expect(routeLine(req({ via: [] }))).toBe('direct')
  })

  it('explains a once-only request and the dev label', () => {
    expect(lengthNote(req())).toBe('')
    expect(lengthNote(req({ grantable: false }))).toBe('Production servers ask every time.')
    expect(lengthNote(req({ grantable: false, env: 'dev' }))).toMatch(/once/)
    expect(approveLabel(req({ touchId: false }))).toBe('Approve')
    expect(toLength('lock')).toBe('lock')
    expect(toLength('forever')).toBe('once')
  })
})

describe('stack approval wording', () => {
  it('names the stack and every key it covers', () => {
    const r = req({ stack: 'Deploy api', keyName: 'deploy, ops', stackServers: [{ name: 'api-prod', env: 'prod' }] })
    expect(stackTitle(r)).toBe('Open the stack “Deploy api”?')
    expect(keysPhrase(r)).toBe('the keys deploy and ops')
    expect(keysPhrase(req({ keyName: 'a, b, c' }))).toBe('the keys a, b and c')
    expect(keysPhrase(req({ keyName: 'deploy' }))).toBe('the key deploy')
    expect(stackHasProd(r)).toBe(true)
    expect(stackHasProd(req({ stackServers: [{ name: 'pi', env: 'dev' }] }))).toBe(false)
  })
})
