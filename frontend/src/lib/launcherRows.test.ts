import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthType, Environment, ForwardType, Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server, Stack, StackStep } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { TunnelRow } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { MAX_ROWS, launcherRows, quickCommand, serverSub, tunnelSub, type LauncherData } from './launcherRows'

const server = (id: string, name: string, over: Partial<Server> = {}): Server =>
  ({
    id, name, jumpId: null, host: `${name}.example`, port: 22, user: 'u', authType: AuthType.AuthAgent,
    environment: Environment.EnvNone, group: '', tags: '', icon: '', color: '', lastUsedAt: null, ...over,
  }) as Server

const step = (over: Partial<StackStep>): StackStep =>
  ({ id: '', stackId: '', position: 0, kind: StepKind.StepServer, serverId: null, forwardId: null, placement: Placement.PlaceTab, runCommand: '', ...over }) as StackStep

const forward = (id: string, serverId: string, name: string, over: Partial<PortForward> = {}): PortForward =>
  ({ id, serverId, name, type: ForwardType.ForwardLocal, bindAddr: '127.0.0.1', bindPort: 5432, destHost: 'localhost', destPort: 5432, icon: '', color: '', ...over }) as PortForward

const tunnel = (f: PortForward, serverName: string, state: string): TunnelRow =>
  ({ forward: f, serverName, status: { forwardId: f.id, state, detail: '', portBusy: false } }) as unknown as TunnelRow

function fixture(): LauncherData {
  const servers = [
    server('ba', 'bastion', { environment: Environment.EnvDev, lastUsedAt: '2026-11-01T09:00:00Z' }),
    server('db', 'db-primary', { jumpId: 'ba', host: '10.20.1.30', user: 'postgres', environment: Environment.EnvProd }),
    server('api', 'api-prod', { host: '10.20.1.14', user: 'deploy', port: 2222, lastUsedAt: '2026-11-05T09:00:00Z', tags: 'web,edge' }),
  ]
  const stacks = [
    { id: 'st', name: 'DB maintenance', description: 'vacuum night', icon: '', color: '', lastLaunchedAt: '2026-11-03T09:00:00Z',
      steps: [step({ serverId: 'db' })] } as unknown as Stack,
    { id: 'empty', name: 'Nothing yet', description: '', icon: '', color: '', lastLaunchedAt: null, steps: [] } as unknown as Stack,
  ]
  const tunnels = [tunnel(forward('pg', 'db', 'postgres'), 'db-primary', 'running')]
  return { servers, commands: [], stacks, tunnels, states: {} }
}

describe('launcherRows', () => {
  // A stack's sub reads the wall clock: from 7 days on it says "last week", which fuzzily matches "web".
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-11-05T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists recent use first when the query is empty, and skips empty stacks', () => {
    const rows = launcherRows(fixture(), '  ')
    expect(rows.map((r) => r.key)).toEqual(['server:api', 'stack:st', 'server:ba', 'server:db', 'tunnel:pg'])
  })

  it('describes each kind', () => {
    const rows = launcherRows(fixture(), '')
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(byKey['server:db']).toMatchObject({ sub: 'postgres@10.20.1.30 · via bastion', env: 'prod', action: 'Connect', kindLabel: 'Server' })
    expect(byKey['server:db'].dot).toEqual({ tone: 'ok', label: 'Tunnel running' })
    expect(byKey['server:api'].sub).toBe('deploy@10.20.1.14:2222')
    expect(byKey['stack:st']).toMatchObject({ action: 'Launch', env: 'prod' })
    expect(byKey['stack:st'].sub).toMatch(/^1 step · /)
    expect(byKey['tunnel:pg']).toMatchObject({ action: 'Stop', sub: 'L 5432 → localhost:5432 · db-primary' })
  })

  it('follows forward:status over the list it read', () => {
    const data = { ...fixture(), states: { pg: 'error' } }
    const rows = launcherRows(data, '')
    expect(rows.find((r) => r.key === 'tunnel:pg')).toMatchObject({ action: 'Start', dot: { tone: 'bad', label: 'Failed' } })
    expect(rows.find((r) => r.key === 'server:db')?.dot).toEqual({ tone: 'bad', label: 'A tunnel failed' })
    data.states = { pg: 'retrying' }
    expect(launcherRows(data, '').find((r) => r.key === 'tunnel:pg')?.action).toBe('Stop')
  })

  it('matches servers, stacks and tunnels fuzzily, the name first', () => {
    const keys = launcherRows(fixture(), 'db').map((r) => r.key)
    expect(keys[0]).toBe('server:db')
    expect(keys).toEqual(expect.arrayContaining(['stack:st', 'tunnel:pg']))
    expect(keys).not.toContain('server:api')
    expect(launcherRows(fixture(), 'web').map((r) => r.key)).toEqual(['server:api'])
    expect(launcherRows(fixture(), 'stack').map((r) => r.key)).toEqual(['stack:st'])
  })

  it('offers an unsaved user@host once, on top', () => {
    const rows = launcherRows(fixture(), 'root@10.0.0.9:2200')
    expect(rows[0]).toMatchObject({ kind: 'quick', name: 'root@10.0.0.9:2200', action: 'Connect', target: { user: 'root', host: '10.0.0.9', port: 2200 } })
  })

  it('puts the saved server on top for a user@host it already has', () => {
    const rows = launcherRows(fixture(), 'deploy@10.20.1.14:2222')
    expect(rows[0].key).toBe('server:api')
    expect(rows.filter((r) => r.kind === 'quick')).toHaveLength(0)
    expect(rows.filter((r) => r.key === 'server:api')).toHaveLength(1)
  })

  it('caps the list', () => {
    const data = fixture()
    data.servers = Array.from({ length: MAX_ROWS + 10 }, (_, i) => server(`s${i}`, `web-${i}`))
    expect(launcherRows(data, '')).toHaveLength(MAX_ROWS)
  })
})

describe('row lines', () => {
  it('names the hops and a non-default port', () => {
    const { servers } = fixture()
    expect(serverSub(servers[1], servers)).toBe('postgres@10.20.1.30 · via bastion')
  })

  it('writes each tunnel type', () => {
    expect(tunnelSub(forward('d', 's', 'socks', { type: ForwardType.ForwardDynamic, bindPort: 1080 }), 'jump')).toBe('D 1080 → SOCKS · jump')
    expect(tunnelSub(forward('r', 's', 'back', { type: ForwardType.ForwardRemote, bindPort: 9000, destHost: 'localhost', destPort: 3000 }), 'web')).toBe(
      'R 9000 → localhost:3000 · web',
    )
  })

  it('spells the ssh command of an unsaved target', () => {
    expect(quickCommand({ user: 'root', host: 'h', port: 22 })).toBe('ssh root@h')
    expect(quickCommand({ user: 'root', host: 'h', port: 2200 })).toBe('ssh root@h -p 2200')
  })
})
