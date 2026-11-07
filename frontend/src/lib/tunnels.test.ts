import { describe, expect, it } from 'vitest'
import { AuthType, Environment, ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import {
  busyText,
  formatBytes,
  localUrl,
  rowState,
  serverLine,
  sparkHeights,
  trafficText,
  tunnelCounts,
  tunnelRoute,
  wanted,
  tunnelsFooter,
} from './tunnels'

function fwd(over: Partial<PortForward>): PortForward {
  return {
    id: 'f',
    serverId: 's',
    name: 'pg',
    type: ForwardType.ForwardLocal,
    bindAddr: '127.0.0.1',
    bindPort: 5432,
    destHost: '127.0.0.1',
    destPort: 5432,
    icon: '',
    color: '',
    autoStart: false,
    reconnect: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

function server(id: string, name: string, jumpId: string | null = null): Server {
  return { id, name, jumpId, host: `${name}.example`, port: 22, user: 'u', authType: AuthType.AuthAgent, environment: Environment.EnvNone } as Server
}

describe('rowState', () => {
  it('maps backend states onto the page’s four', () => {
    expect(['running', 'error', 'retrying', 'stopped', undefined, ''].map(rowState)).toEqual([
      'running',
      'failed',
      'retrying',
      'stopped',
      'stopped',
      'stopped',
    ])
  })
  it('keeps the switch on while a dropped tunnel is coming back', () => {
    expect(wanted('running')).toBe(true)
    expect(wanted('retrying')).toBe(true)
    expect(wanted('failed')).toBe(false)
  })
})

describe('tunnelRoute', () => {
  it('reads like the board', () => {
    expect(tunnelRoute(fwd({}))).toBe('127.0.0.1:5432 → 127.0.0.1:5432')
    expect(tunnelRoute(fwd({ type: ForwardType.ForwardDynamic, bindPort: 1080, destHost: '', destPort: 0 }))).toBe(
      '127.0.0.1:1080 → SOCKS',
    )
    expect(tunnelRoute(fwd({ type: ForwardType.ForwardRemote, bindPort: 9000, destHost: 'localhost', destPort: 3000 }))).toBe(
      'server :9000 → localhost:3000',
    )
  })
})

describe('serverLine', () => {
  const servers = [server('b', 'bastion'), server('db', 'db-primary', 'b'), server('nas', 'nas')]
  it('names the hops before the server', () => {
    expect(serverLine('db', 'x', servers)).toBe('db-primary · via bastion')
    expect(serverLine('nas', 'x', servers)).toBe('nas')
  })
  it('falls back to the backend’s name for an unknown server', () => {
    expect(serverLine('gone', 'old-name', servers)).toBe('old-name')
  })
})

describe('formatBytes', () => {
  it('writes sizes as Finder does', () => {
    expect([0, 999, 1000, 2400000, 18000000, 1.5e9].map(formatBytes)).toEqual(['0 B', '999 B', '1 KB', '2.4 MB', '18 MB', '1.5 GB'])
  })
})

describe('sparkHeights', () => {
  it('scales to the busiest interval between 2 and 18 px', () => {
    const h = sparkHeights([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50, 100], true)
    expect(h).toHaveLength(12)
    expect(h.slice(-2)).toEqual([10, 18])
    expect(h[0]).toBe(2)
  })
  it('draws flat while off, idle or without data', () => {
    expect(new Set(sparkHeights([5, 9, 1], false))).toEqual(new Set([2]))
    expect(new Set(sparkHeights(null, true))).toEqual(new Set([2]))
    expect(new Set(sparkHeights(new Array(12).fill(0), true))).toEqual(new Set([2]))
  })
  it('keeps the newest twelve and pads a short history on the left', () => {
    expect(sparkHeights([1, 1], true)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 18, 18])
  })
})

describe('trafficText', () => {
  it('says what the cell shows per state', () => {
    expect(trafficText('running', 2400000)).toBe('2.4 MB')
    expect(trafficText('running', 0)).toBe('0 B')
    expect(trafficText('failed', 9)).toBe('failed')
    expect(trafficText('retrying', 9)).toBe('retrying')
    expect(trafficText('stopped', 9)).toBe('off')
  })
})

describe('tunnelCounts', () => {
  it('counts running and failed tunnels of the listed ids', () => {
    const states: Record<string, string> = { a: 'running', b: 'error', c: 'retrying', d: 'running' }
    expect(tunnelCounts(['a', 'b', 'c', 'e'], (id) => states[id])).toEqual({ running: 1, failed: 1, total: 4 })
  })
})

describe('localUrl', () => {
  it('opens a local tunnel on localhost', () => {
    expect(localUrl(fwd({ bindPort: 8080 }))).toBe('http://localhost:8080')
    expect(localUrl(fwd({ bindAddr: '192.168.1.4', bindPort: 8080 }))).toBe('http://192.168.1.4:8080')
    expect(localUrl(fwd({ type: ForwardType.ForwardDynamic }))).toBeNull()
  })
})

describe('busyText', () => {
  it('names the owner when lsof found one', () => {
    expect(busyText(6379, 'redis-server (pid 4121)')).toBe('Port 6379 on this Mac is held by redis-server (pid 4121).')
    expect(busyText(6379, '')).toBe('Port 6379 on this Mac is already in use.')
  })
})

describe('tunnelsFooter', () => {
  it('follows the reconnect and keep-while-locked settings', () => {
    expect(tunnelsFooter(true, true)).toBe(
      'Tunnels with reconnect on come back after sleep and Wi-Fi changes. They keep running while Zish is locked or its window is closed; one that drops while locked comes back after unlock.',
    )
    expect(tunnelsFooter(false, true)).toContain('stays down. They keep running while Zish is locked or its window is closed.')
    expect(tunnelsFooter(true, false)).toContain('Locking Zish stops them; closing its window does not.')
  })
})
