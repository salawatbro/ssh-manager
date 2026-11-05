import { describe, expect, it } from 'vitest'
import { AuthType, Environment, ForwardType, Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server, Stack, StackStep } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { AgentStatus, TunnelRow } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { LauncherData } from './launcherRows'
import { MAX_PINNED, fitHeight, trayBadge, trayOrder, traySections, tunnelCount } from './trayPanel'

const server = (id: string, over: Partial<Server> = {}): Server =>
  ({
    id, name: id, jumpId: null, host: `${id}.example`, port: 22, user: 'u', authType: AuthType.AuthAgent,
    environment: Environment.EnvNone, group: '', tags: '', icon: '', color: '', lastUsedAt: null, pinned: false, ...over,
  }) as Server

const step = (serverId: string): StackStep =>
  ({ id: '', stackId: '', position: 0, kind: StepKind.StepServer, serverId, forwardId: null, placement: Placement.PlaceTab, runCommand: '' }) as StackStep

const stack = (id: string, over: Partial<Stack> = {}): Stack =>
  ({ id, name: id, description: '', icon: '', color: '', lastLaunchedAt: null, shortcut: '', inMenuBar: true, steps: [step('a')], ...over }) as unknown as Stack

const tunnel = (id: string, state: string): TunnelRow =>
  ({
    forward: { id, serverId: 'a', name: id, type: ForwardType.ForwardLocal, bindAddr: '127.0.0.1', bindPort: 5432, destHost: 'localhost', destPort: 5432, icon: '', color: '' } as PortForward,
    serverName: 'a',
    status: { forwardId: id, state, detail: '', portBusy: false },
  }) as unknown as TunnelRow

const data = (over: Partial<LauncherData> = {}): LauncherData => ({ servers: [], stacks: [], tunnels: [], states: {}, ...over })

const agent = (over: Partial<AgentStatus> = {}): AgentStatus =>
  ({ enabled: true, running: true, socketPath: '', error: '', clientLocked: false, tempKeys: [], ...over }) as AgentStatus

describe('traySections', () => {
  it('keeps pinned servers in list order and caps them', () => {
    const servers = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => server(id, { pinned: id !== 'b' }))
    const { pinned } = traySections(data({ servers }))
    expect(pinned.map((r) => r.id)).toEqual(['a', 'c', 'd', 'e', 'f'])
    expect(pinned).toHaveLength(MAX_PINNED)
  })

  it('shows only menu-bar stacks with steps, with their shortcut', () => {
    const stacks = [
      stack('shown', { shortcut: 'alt+cmd+1' }),
      stack('hidden', { inMenuBar: false }),
      stack('empty', { steps: [] }),
      stack('plain'),
    ]
    const { stacks: rows } = traySections(data({ servers: [server('a')], stacks }))
    expect(rows.map((r) => [r.id, r.shortcut])).toEqual([
      ['shown', '⌥⌘1'],
      ['plain', ''],
    ])
  })

  it('lists every tunnel and follows forward:status', () => {
    const d = data({ tunnels: [tunnel('pg', 'running'), tunnel('gf', 'stopped')], states: { gf: 'running' } })
    const { tunnels } = traySections(d)
    expect(tunnels.map((r) => r.action)).toEqual(['Stop', 'Stop'])
    expect(tunnelCount(tunnels)).toBe('2 of 2 on')
  })

  it('walks pinned, then stacks, then tunnels', () => {
    const d = data({ servers: [server('a', { pinned: true })], stacks: [stack('s')], tunnels: [tunnel('t', 'stopped')] })
    expect(trayOrder(traySections(d)).map((r) => r.key)).toEqual(['server:a', 'stack:s', 'tunnel:t'])
  })
})

describe('tunnelCount', () => {
  it('counts a reconnecting tunnel as on', () => {
    const { tunnels } = traySections(data({ tunnels: [tunnel('a', 'retrying'), tunnel('b', 'error'), tunnel('c', 'stopped')] }))
    expect(tunnelCount(tunnels)).toBe('1 of 3 on')
  })
})

describe('trayBadge', () => {
  it('puts the lock before the agent', () => {
    expect(trayBadge(agent(), true)).toEqual({ tone: 'idle', text: 'Locked' })
  })

  it('reports the agent', () => {
    expect(trayBadge(agent(), false)).toEqual({ tone: 'ok', text: 'Agent on' })
    expect(trayBadge(agent({ enabled: false, running: false }), false)).toEqual({ tone: 'idle', text: 'Agent off' })
    expect(trayBadge(null, false)).toEqual({ tone: 'idle', text: 'Agent off' })
    expect(trayBadge(agent({ running: false, error: 'socket in use' }), false)).toEqual({ tone: 'bad', text: 'Agent failed' })
    expect(trayBadge(agent({ running: false }), false)).toEqual({ tone: 'bad', text: 'Agent stopped' })
  })
})

describe('fitHeight', () => {
  it('adds the hidden part of the list to the frame', () => {
    expect(fitHeight(420, 300, 520)).toBe(640)
    expect(fitHeight(260, 178, 178)).toBe(260)
    expect(fitHeight(200.4, 100, 100)).toBe(201)
  })
})
