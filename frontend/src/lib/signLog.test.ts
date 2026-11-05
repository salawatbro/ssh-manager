import { describe, expect, it } from 'vitest'
import type { AgentSignEvent } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { eventClock, outcomeLabel, outcomeTone, prependEvent, whereLine, whoLine } from './signLog'

function ev(p: Partial<AgentSignEvent>): AgentSignEvent {
  return {
    id: 1, keyId: 'k1', keyName: 'work', fingerprint: 'SHA256:a', clientName: 'ssh', clientApp: 'Ghostty',
    clientChain: 'ssh ← zsh ← Ghostty', clientPid: 42, inProcess: false, destination: '', forwarded: false,
    outcome: 'allowed', detail: '', createdAt: '2026-11-05T12:00:00Z', ...p,
  }
}

describe('sign log formatting', () => {
  it('labels and tones outcomes the way the board does', () => {
    expect(outcomeLabel('confirmed')).toBe('Touch ID')
    expect(outcomeTone('confirmed')).toBe('ok')
    expect(outcomeLabel('granted')).toBe('Approval')
    expect(outcomeTone('granted')).toBe('plain')
    expect(outcomeTone('denied')).toBe('bad')
    expect(outcomeTone('locked')).toBe('warn')
    expect(outcomeLabel('something-new')).toBe('something-new')
    expect(outcomeTone('something-new')).toBe('bad')
  })

  it('names who asked', () => {
    expect(whoLine(ev({}))).toBe('ssh ← zsh ← Ghostty')
    expect(whoLine(ev({ forwarded: true }))).toBe('ssh ← zsh ← Ghostty (forwarded agent)')
    expect(whoLine(ev({ clientChain: '' }))).toBe('ssh')
    expect(whoLine(ev({ clientChain: '', clientName: '' }))).toBe('unknown process')
    expect(whoLine(ev({ inProcess: true, clientChain: 'tunnel' }))).toBe('Zish · tunnel')
  })

  it('names where the signature went, else the key', () => {
    expect(whereLine(ev({ destination: 'db-primary' }))).toEqual({ text: 'db-primary', server: true })
    expect(whereLine(ev({}))).toEqual({ text: 'work', server: false })
    expect(whereLine(ev({ keyName: '' }))).toEqual({ text: 'ssh-add key', server: false })
  })

  it('prepends and caps', () => {
    const list = [ev({ id: 1 }), ev({ id: 2 })]
    expect(prependEvent(list, ev({ id: 3 }), 2).map((e) => e.id)).toEqual([3, 1])
  })
})

describe('eventClock', () => {
  it('shows the time today and the date before', () => {
    const now = new Date(2026, 10, 5, 15, 0, 0)
    expect(eventClock(new Date(2026, 10, 5, 9, 42, 0).toISOString(), now)).toMatch(/09.42/)
    expect(eventClock(new Date(2026, 10, 3, 9, 30, 0).toISOString(), now)).toMatch(/3/)
    expect(eventClock('nope', now)).toBe('')
  })
})
