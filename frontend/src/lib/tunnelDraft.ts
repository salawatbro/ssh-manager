import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { ForwardInput, PortCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { PLAIN_TUNNEL_LOOK, TUNNEL_PRESETS, type TunnelPreset } from './tunnelPresets'

// The New tunnel sheet's state, in the sheet's own terms: a port on this Mac
// and a port on the server, whichever way the tunnel points. toForwardInput
// maps them onto bind/dest.
export interface TunnelDraft {
  type: ForwardType
  serverId: string
  name: string
  icon: string
  color: string
  // Once the user types a name or picks a look, presets stop replacing it.
  nameTouched: boolean
  lookTouched: boolean
  bindAddr: string
  macPort: number | ''
  serverPort: number | ''
  // -L: the host the server connects to. -R: the host on this Mac's side.
  destHost: string
  autoStart: boolean
  reconnect: boolean
}

export function newTunnelDraft(serverId: string): TunnelDraft {
  const base: TunnelDraft = {
    type: ForwardType.ForwardLocal,
    serverId,
    name: '',
    ...PLAIN_TUNNEL_LOOK,
    nameTouched: false,
    lookTouched: false,
    bindAddr: '127.0.0.1',
    macPort: '',
    serverPort: '',
    destHost: 'localhost',
    // The board starts a new tunnel with both on.
    autoStart: true,
    reconnect: true,
  }
  return withPreset(base, TUNNEL_PRESETS[0])
}

export function draftFromForward(f: PortForward): TunnelDraft {
  const remote = f.type === ForwardType.ForwardRemote
  return {
    type: f.type,
    serverId: f.serverId,
    name: f.name,
    icon: f.icon,
    color: f.color,
    nameTouched: true,
    lookTouched: true,
    bindAddr: f.bindAddr || '127.0.0.1',
    macPort: remote ? f.destPort : f.bindPort,
    serverPort: remote ? f.bindPort : f.type === ForwardType.ForwardLocal ? f.destPort : '',
    destHost: f.destHost || 'localhost',
    autoStart: f.autoStart,
    reconnect: f.reconnect,
  }
}

function named(d: TunnelDraft, name: string, look: { icon: string; color: string }): TunnelDraft {
  return {
    ...d,
    name: d.nameTouched ? d.name : name,
    ...(d.lookTouched ? {} : look),
  }
}

// withType switches the kind. A fresh draft takes the board's starting ports
// for it; an edited one keeps its ports where they still apply.
export function withType(d: TunnelDraft, type: ForwardType, serverName: string, editing: boolean): TunnelDraft {
  if (type === d.type) return d
  const next = { ...d, type, destHost: d.destHost || 'localhost' }
  if (editing) return type === ForwardType.ForwardDynamic ? { ...next, serverPort: '' } : next
  if (type === ForwardType.ForwardLocal) return withPreset(next, TUNNEL_PRESETS[0])
  if (type === ForwardType.ForwardRemote) {
    return named({ ...next, macPort: 3000, serverPort: 9000, destHost: 'localhost' }, 'share-dev', PLAIN_TUNNEL_LOOK)
  }
  return named({ ...next, macPort: 1080, serverPort: '' }, `socks-${serverName}`, PLAIN_TUNNEL_LOOK)
}

export function withPreset(d: TunnelDraft, p: TunnelPreset): TunnelDraft {
  const look = { icon: p.icon, color: p.color }
  const ports = { ...d, macPort: p.port, serverPort: p.port }
  return named(ports, d.type === ForwardType.ForwardRemote ? `${p.name}-share` : p.name, look)
}

// The preset the ports currently match, so its chip shows as chosen.
export function activePreset(d: TunnelDraft): string {
  if (d.type === ForwardType.ForwardDynamic) return ''
  return TUNNEL_PRESETS.find((p) => d.macPort === p.port && d.serverPort === p.port)?.id ?? ''
}

export function toForwardInput(d: TunnelDraft, id: string): ForwardInput {
  const remote = d.type === ForwardType.ForwardRemote
  const dynamic = d.type === ForwardType.ForwardDynamic
  const num = (v: number | '') => (v === '' ? 0 : v)
  return {
    id,
    serverId: d.serverId,
    name: d.name.trim(),
    type: d.type,
    bindAddr: d.bindAddr || '127.0.0.1',
    bindPort: num(remote ? d.serverPort : d.macPort),
    destHost: dynamic ? '' : d.destHost.trim(),
    destPort: dynamic ? 0 : num(remote ? d.macPort : d.serverPort),
    icon: d.icon,
    color: d.color,
    autoStart: d.autoStart,
    reconnect: d.reconnect,
  }
}

// Whether a save changes what a running tunnel listens on or reaches — the
// switches, name and look apply without a restart.
export function routeChanged(f: PortForward, in_: ForwardInput): boolean {
  return (
    f.type !== in_.type ||
    f.bindAddr !== in_.bindAddr ||
    f.bindPort !== in_.bindPort ||
    f.destHost !== in_.destHost ||
    f.destPort !== in_.destPort
  )
}

const validPort = (p: number | '') => p !== '' && p >= 1 && p <= 65535

// The first thing stopping a save, worded for the sheet, or null.
export function draftError(d: TunnelDraft): string | null {
  if (!d.serverId) return 'Choose a server for the tunnel.'
  if (!d.name.trim()) return 'Give the tunnel a name.'
  if (!validPort(d.macPort)) return 'Enter a port on this Mac between 1 and 65535.'
  if (d.type === ForwardType.ForwardDynamic) return null
  if (!validPort(d.serverPort)) return 'Enter a port on the server between 1 and 65535.'
  if (d.type === ForwardType.ForwardLocal && !d.destHost.trim()) return 'Enter the host the server should reach.'
  return null
}

// The port on this Mac a tunnel would listen on, or null when it listens on
// the server (-R) or no port is typed yet.
export function listenPortOnMac(d: TunnelDraft): number | null {
  if (d.type === ForwardType.ForwardRemote || !validPort(d.macPort)) return null
  return d.macPort as number
}

export interface PortNote {
  tone: 'ok' | 'warn' | 'muted'
  text: string
  suggest: number
}

// The line under the ports. `ownTunnel` = this saved tunnel is running and
// holds the port itself, so a busy answer is no news.
export function portNote(d: TunnelDraft, check: PortCheck | null, ownTunnel: boolean): PortNote {
  if (d.type === ForwardType.ForwardRemote) {
    const at = d.serverPort === '' ? '…' : d.serverPort
    return { tone: 'muted', text: `The server listens on :${at} and sends traffic to your Mac.`, suggest: 0 }
  }
  const port = listenPortOnMac(d)
  if (port === null) return { tone: 'muted', text: 'Enter a port on this Mac.', suggest: 0 }
  if (ownTunnel) return { tone: 'ok', text: `Port ${port} is held by this tunnel while it runs.`, suggest: 0 }
  if (!check) return { tone: 'muted', text: `Checking port ${port}…`, suggest: 0 }
  if (check.free) return { tone: 'ok', text: `Port ${port} is free on this Mac.`, suggest: 0 }
  const who = check.owner ? `used by ${check.owner}` : 'already in use on this Mac'
  return { tone: 'warn', text: `Port ${port} is ${who}.`, suggest: check.suggest }
}

export interface RouteView {
  arrow: '→' | '←'
  macSide: string
  farTitle: string
  farSub: string
}

// The three boxes: this Mac, the server, and where the traffic ends up.
export function routeView(d: TunnelDraft, serverName: string): RouteView {
  const mac = `localhost:${d.macPort === '' ? '…' : d.macPort}`
  const far = d.serverPort === '' ? '…' : d.serverPort
  if (d.type === ForwardType.ForwardRemote) {
    return { arrow: '←', macSide: mac, farTitle: 'Server port', farSub: `${serverName}:${far}` }
  }
  if (d.type === ForwardType.ForwardDynamic) {
    return { arrow: '→', macSide: `SOCKS on :${d.macPort === '' ? '…' : d.macPort}`, farTitle: 'Any website', farSub: `leaves from ${serverName}` }
  }
  return { arrow: '→', macSide: mac, farTitle: d.destHost || 'host', farSub: `:${far} seen from ${serverName}` }
}

// The toast once a tunnel is up, saying where to point things at it.
export function runningText(d: TunnelDraft, serverName: string): string {
  const name = d.name.trim()
  if (d.type === ForwardType.ForwardDynamic) return `${name} running · SOCKS on :${d.macPort}`
  if (d.type === ForwardType.ForwardRemote) return `${name} running · ${serverName}:${d.serverPort}`
  return `${name} running on localhost:${d.macPort}`
}
