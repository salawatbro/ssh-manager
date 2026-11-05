import { describe, expect, it } from 'vitest'
import type { AgentSignEvent } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { clientLine, eventTime, filterEvents, outcomeLabel, outcomeTone, prependEvent } from './signLog'

function ev(p: Partial<AgentSignEvent>): AgentSignEvent {
  return {
    id: 1, keyId: 'k1', keyName: 'work', fingerprint: 'SHA256:a', clientName: 'ssh', clientApp: 'Ghostty',
    clientChain: 'ssh ← zsh', clientPid: 42, inProcess: false, destination: '', forwarded: false,
    outcome: 'allowed', detail: '', createdAt: '2026-11-05T12:00:00Z', ...p,
  }
}

describe('sign log formatting', () => {
  it('labels and tones outcomes', () => {
    expect(outcomeLabel('confirmed')).toBe('Approved')
    expect(outcomeTone('confirmed')).toBe('ok')
    expect(outcomeTone('denied')).toBe('warn')
    expect(outcomeTone('locked')).toBe('warn')
    expect(outcomeTone('error')).toBe('fail')
    expect(outcomeLabel('something-new')).toBe('something-new')
  })

  it('describes the client', () => {
    expect(clientLine(ev({}))).toBe('ssh in Ghostty')
    expect(clientLine(ev({ destination: 'prod-db', forwarded: true }))).toBe('ssh in Ghostty → prod-db (forwarded agent)')
    expect(clientLine(ev({ clientApp: 'ssh' }))).toBe('ssh')
    expect(clientLine(ev({ clientName: '', clientApp: '' }))).toBe('unknown process')
    expect(clientLine(ev({ inProcess: true, clientChain: 'test connection', destination: 'db' }))).toBe(
      'Zish · test connection → db',
    )
  })

  it('filters by key id, or fingerprint for temporary keys', () => {
    const list = [ev({ id: 1 }), ev({ id: 2, keyId: 'k2' }), ev({ id: 3, keyId: '', fingerprint: 'SHA256:t' })]
    expect(filterEvents(list, '').map((e) => e.id)).toEqual([1, 2, 3])
    expect(filterEvents(list, 'k2').map((e) => e.id)).toEqual([2])
    expect(filterEvents(list, 'SHA256:t').map((e) => e.id)).toEqual([3])
  })

  it('prepends and caps', () => {
    const list = [ev({ id: 1 }), ev({ id: 2 })]
    expect(prependEvent(list, ev({ id: 3 }), 2).map((e) => e.id)).toEqual([3, 1])
  })
})

describe('eventTime', () => {
  it('shows the date only for older events', () => {
    const now = new Date(2026, 10, 5, 15, 0, 0)
    expect(eventTime(new Date(2026, 10, 5, 9, 30, 0).toISOString(), now)).not.toMatch(/Nov/)
    expect(eventTime(new Date(2026, 10, 3, 9, 30, 0).toISOString(), now)).toMatch(/3/)
    expect(eventTime('nope', now)).toBe('')
  })
})
