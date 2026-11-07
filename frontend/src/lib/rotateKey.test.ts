import { describe, expect, it } from 'vitest'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { moved, rotatedName, rotateServers, type RotateState } from './rotateKey'

const key = (name: string) => ({ id: name, name }) as AgentKey
const server = (id: string) => ({ id, name: id }) as Server

describe('rotatedName', () => {
  it('adds the year, replacing one already there, and avoids taken names', () => {
    expect(rotatedName(key('work'), [key('work')], 2026)).toBe('work 2026')
    expect(rotatedName(key('work 2024'), [key('work 2024')], 2026)).toBe('work 2026')
    expect(rotatedName(key('work'), [key('work'), key('Work 2026'), key('work 2026 (2)')], 2026)).toBe('work 2026 (3)')
  })
})

describe('rotateServers', () => {
  it('goes one server at a time and reports each outcome', async () => {
    const seen: string[] = []
    const states: Record<string, RotateState> = {}
    await rotateServers([server('a'), server('b'), server('c')], {
      rotate: async (id) => {
        seen.push(id)
        if (id === 'b') throw new Error('The server didn’t accept the key.')
        return id === 'a' ? { oldKeyRemoved: true, note: '' } : { oldKeyRemoved: false, note: 'Permission denied.' }
      },
      onState: (id, st) => {
        states[id] = st
      },
    })
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(states.a.tone).toBe('ok')
    expect(states.b).toEqual({ tone: 'bad', text: 'The server didn’t accept the key.' })
    expect(states.c).toEqual({ tone: 'warn', text: 'On the new key. Permission denied.' })
    expect([moved(states.a), moved(states.b), moved(states.c)]).toEqual([true, false, true])
  })
})
