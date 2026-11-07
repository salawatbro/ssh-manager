import { describe, expect, it } from 'vitest'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import {
  activePreset,
  draftError,
  draftFromForward,
  listenPortOnMac,
  newTunnelDraft,
  portNote,
  routeChanged,
  routeView,
  runningText,
  toForwardInput,
  withPreset,
  withType,
} from './tunnelDraft'
import { presetById, TUNNEL_PRESETS } from './tunnelPresets'

const redis = presetById('redis')!

describe('tunnelPresets', () => {
  it('covers the board’s five services with distinct ports', () => {
    expect(TUNNEL_PRESETS.map((p) => [p.label, p.port])).toEqual([
      ['Postgres', 5432],
      ['MySQL', 3306],
      ['Redis', 6379],
      ['Web', 8080],
      ['Kubernetes', 6443],
    ])
  })
})

describe('newTunnelDraft', () => {
  it('starts as the board does: a local Postgres tunnel', () => {
    const d = newTunnelDraft('s1')
    expect(d).toMatchObject({ type: 'L', name: 'postgres', icon: 'database', color: 'blue', macPort: 5432, serverPort: 5432 })
    expect(activePreset(d)).toBe('postgres')
    expect(toForwardInput(d, '')).toEqual({
      id: '',
      serverId: 's1',
      name: 'postgres',
      type: 'L',
      bindAddr: '127.0.0.1',
      bindPort: 5432,
      destHost: 'localhost',
      destPort: 5432,
      icon: 'database',
      color: 'blue',
      autoStart: true,
      reconnect: true,
    })
  })
})

describe('withPreset and withType', () => {
  it('fills ports, name and look until the user changes them', () => {
    const d = withPreset(newTunnelDraft('s1'), redis)
    expect(d).toMatchObject({ name: 'redis', icon: 'layers', color: 'red', macPort: 6379, serverPort: 6379 })
    const typed = withPreset({ ...d, name: 'cache', nameTouched: true, lookTouched: true, icon: 'star' }, presetById('mysql')!)
    expect(typed).toMatchObject({ name: 'cache', icon: 'star', macPort: 3306 })
  })

  it('names a remote preset as a share', () => {
    const r = withPreset(withType(newTunnelDraft('s1'), ForwardType.ForwardRemote, 'db', false), redis)
    expect(r.name).toBe('redis-share')
  })

  it('gives each fresh kind the board’s starting ports', () => {
    const d = newTunnelDraft('s1')
    expect(withType(d, ForwardType.ForwardDynamic, 'db', false)).toMatchObject({ macPort: 1080, serverPort: '', name: 'socks-db', icon: 'plug' })
    expect(withType(d, ForwardType.ForwardRemote, 'db', false)).toMatchObject({ macPort: 3000, serverPort: 9000, name: 'share-dev' })
  })

  it('keeps an edited tunnel’s ports when its kind changes', () => {
    const d = { ...newTunnelDraft('s1'), macPort: 7000 as const, nameTouched: true }
    expect(withType(d, ForwardType.ForwardDynamic, 'db', true)).toMatchObject({ macPort: 7000, serverPort: '', name: 'postgres' })
  })
})

describe('toForwardInput', () => {
  it('maps a remote tunnel’s server port to the bind side', () => {
    const r = { ...withType(newTunnelDraft('s1'), ForwardType.ForwardRemote, 'db', false) }
    expect(toForwardInput(r, 'f1')).toMatchObject({ type: 'R', bindPort: 9000, destHost: 'localhost', destPort: 3000 })
  })

  it('sends no destination for SOCKS', () => {
    const d = withType(newTunnelDraft('s1'), ForwardType.ForwardDynamic, 'db', false)
    expect(toForwardInput(d, '')).toMatchObject({ bindPort: 1080, destHost: '', destPort: 0 })
  })

  it('round-trips a saved forward', () => {
    const f = { id: 'f1', serverId: 's1', name: 'web', type: 'R', bindAddr: '127.0.0.1', bindPort: 9000, destHost: 'localhost', destPort: 3000, icon: '', color: '', autoStart: false, reconnect: true } as PortForward
    expect(toForwardInput(draftFromForward(f), 'f1')).toEqual({ ...f })
  })

  it('keeps the runtime switches through a kind or preset change', () => {
    const d = { ...newTunnelDraft('s1'), autoStart: false, reconnect: false }
    const moved = withPreset(withType(d, ForwardType.ForwardDynamic, 'db', false), redis)
    expect(toForwardInput(moved, '')).toMatchObject({ autoStart: false, reconnect: false })
  })
})

describe('routeChanged', () => {
  it('ignores what applies without a restart', () => {
    const f = { id: 'f1', serverId: 's1', name: 'pg', type: 'L', bindAddr: '127.0.0.1', bindPort: 5432, destHost: 'localhost', destPort: 5432, icon: '', color: '', autoStart: false, reconnect: false } as PortForward
    const same = toForwardInput({ ...draftFromForward(f), name: 'db', autoStart: true, reconnect: true, icon: 'star' }, 'f1')
    expect(routeChanged(f, same)).toBe(false)
    expect(routeChanged(f, { ...same, bindPort: 5433 })).toBe(true)
  })
})

describe('draftError', () => {
  it('names the first missing piece', () => {
    const d = newTunnelDraft('s1')
    expect(draftError(d)).toBeNull()
    expect(draftError({ ...d, serverId: '' })).toMatch(/server/)
    expect(draftError({ ...d, name: ' ' })).toMatch(/name/)
    expect(draftError({ ...d, macPort: '' })).toMatch(/this Mac/)
    expect(draftError({ ...d, serverPort: 70000 })).toMatch(/on the server/)
    expect(draftError({ ...d, destHost: '' })).toMatch(/host/)
    expect(draftError(withType(d, ForwardType.ForwardDynamic, 'db', false))).toBeNull()
  })
})

describe('portNote', () => {
  const d = newTunnelDraft('s1')

  it('reports free, busy with owner and suggestion, and the tunnel’s own port', () => {
    expect(portNote(d, null, false)).toMatchObject({ tone: 'muted', text: 'Checking port 5432…' })
    expect(portNote(d, { free: true, owner: '', suggest: 0 }, false)).toMatchObject({ tone: 'ok', text: 'Port 5432 is free on this Mac.' })
    expect(portNote(d, { free: false, owner: 'postgres (pid 88)', suggest: 5433 }, false)).toEqual({
      tone: 'warn',
      text: 'Port 5432 is used by postgres (pid 88).',
      suggest: 5433,
    })
    expect(portNote(d, { free: false, owner: '', suggest: 0 }, false).text).toBe('Port 5432 is already in use on this Mac.')
    expect(portNote(d, { free: false, owner: 'sshmgr (pid 1)', suggest: 5433 }, true).tone).toBe('ok')
  })

  it('checks nothing on this Mac for a remote tunnel', () => {
    const r = withType(d, ForwardType.ForwardRemote, 'db', false)
    expect(listenPortOnMac(r)).toBeNull()
    expect(portNote(r, null, false).text).toBe('The server listens on :9000 and sends traffic to your Mac.')
  })
})

describe('routeView', () => {
  it('draws each kind from this Mac outwards', () => {
    const d = newTunnelDraft('s1')
    expect(routeView(d, 'db')).toEqual({ arrow: '→', macSide: 'localhost:5432', farTitle: 'localhost', farSub: ':5432 seen from db' })
    expect(routeView(withType(d, ForwardType.ForwardRemote, 'db', false), 'db')).toEqual({
      arrow: '←',
      macSide: 'localhost:3000',
      farTitle: 'Server port',
      farSub: 'db:9000',
    })
    expect(routeView(withType(d, ForwardType.ForwardDynamic, 'db', false), 'db').macSide).toBe('SOCKS on :1080')
  })
})

describe('runningText', () => {
  it('says where each kind can be reached', () => {
    const d = newTunnelDraft('s1')
    expect(runningText(d, 'db')).toBe('postgres running on localhost:5432')
    expect(runningText(withType(d, ForwardType.ForwardRemote, 'db', false), 'db')).toBe('share-dev running · db:9000')
    expect(runningText(withType(d, ForwardType.ForwardDynamic, 'db', false), 'db')).toBe('socks-db running · SOCKS on :1080')
  })
})
