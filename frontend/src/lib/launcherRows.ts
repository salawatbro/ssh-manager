import Fuse from 'fuse.js'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server, Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { TunnelRow } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { FUZZY_MATCH } from './fuzzy'
import { findExistingServer, formatQuickTarget, parseQuickConnect, type QuickConnectTarget } from './quickConnect'
import { jumpChain } from './route'
import { cardMeta, stackEnv } from './stacks'
import { rowState, wanted, type RowState } from './tunnels'

// The ⌥Space launcher's rows: servers, stacks and tunnels in one fuzzy list,
// plus an unsaved `user@host[:port]` row. The window keeps no Zustand state;
// everything here comes from LauncherData, which it reads through services.

export type LauncherKind = 'server' | 'stack' | 'tunnel' | 'quick'
export type Tone = 'ok' | 'bad' | 'warn' | 'idle'

export interface LauncherRow {
  key: string
  kind: LauncherKind
  id: string
  name: string
  sub: string
  env: string
  look: { icon: string; color: string; group: string }
  dot: { tone: Tone; label: string } | null
  kindLabel: string
  action: string
  target?: QuickConnectTarget
  // Extra words a query may match: host, group, tags, the tunnel's server.
  search: string[]
  recency: number
}

export interface LauncherData {
  servers: Server[]
  stacks: Stack[]
  tunnels: TunnelRow[]
  // forward:status states heard since the tunnels were read, by forward id.
  states: Record<string, string>
}

export const MAX_ROWS = 50

const KIND_ORDER: Record<LauncherKind, number> = { quick: 0, server: 1, stack: 2, tunnel: 3 }

const TUNNEL_DOT: Record<RowState, { tone: Tone; label: string }> = {
  running: { tone: 'ok', label: 'Running' },
  failed: { tone: 'bad', label: 'Failed' },
  retrying: { tone: 'warn', label: 'Reconnecting' },
  stopped: { tone: 'idle', label: 'Stopped' },
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0)

function stateOf(t: TunnelRow, data: LauncherData): RowState {
  return rowState(data.states[t.forward.id] ?? t.status.state)
}

// "deploy@10.20.1.14:2222 · via bastion"
export function serverSub(s: Server, servers: Server[]): string {
  const target = `${s.user}@${s.host}${s.port === 22 ? '' : `:${s.port}`}`
  const hops = jumpChain(s, servers).slice(0, -1)
  return hops.length ? `${target} · via ${hops.map((h) => h.name).join(' › ')}` : target
}

// "L 5432 → localhost:5432 · db-primary"
export function tunnelSub(f: PortForward, serverName: string): string {
  const to = f.type === ForwardType.ForwardDynamic ? 'SOCKS' : `${f.destHost}:${f.destPort}`
  const flag = f.type === ForwardType.ForwardRemote ? 'R' : f.type === ForwardType.ForwardDynamic ? 'D' : 'L'
  return `${flag} ${f.bindPort} → ${to} · ${serverName}`
}

function serverRow(s: Server, data: LauncherData): LauncherRow {
  const states = data.tunnels.filter((t) => t.forward.serverId === s.id).map((t) => stateOf(t, data))
  const dot = states.includes('failed')
    ? { tone: 'bad' as const, label: 'A tunnel failed' }
    : states.includes('running')
      ? { tone: 'ok' as const, label: 'Tunnel running' }
      : null
  return {
    key: `server:${s.id}`,
    kind: 'server',
    id: s.id,
    name: s.name,
    sub: serverSub(s, data.servers),
    env: s.environment,
    look: { icon: s.icon, color: s.color, group: s.group },
    dot,
    kindLabel: 'Server',
    action: 'Connect',
    search: [s.host, s.user, s.group, s.tags],
    recency: time(s.lastUsedAt),
  }
}

function stackRow(st: Stack, data: LauncherData): LauncherRow {
  return {
    key: `stack:${st.id}`,
    kind: 'stack',
    id: st.id,
    name: st.name,
    sub: cardMeta(st),
    env: stackEnv(st, data.servers, data.tunnels.map((t) => t.forward)),
    look: { icon: st.icon, color: st.color, group: '' },
    dot: null,
    kindLabel: 'Stack',
    action: 'Launch',
    search: [st.description],
    recency: time(st.lastLaunchedAt),
  }
}

function tunnelRow(t: TunnelRow, data: LauncherData): LauncherRow {
  const f = t.forward
  const state = stateOf(t, data)
  return {
    key: `tunnel:${f.id}`,
    kind: 'tunnel',
    id: f.id,
    name: f.name,
    sub: tunnelSub(f, t.serverName),
    env: '',
    look: { icon: f.icon, color: f.color, group: '' },
    dot: TUNNEL_DOT[state],
    kindLabel: 'Tunnel',
    action: wanted(state) ? 'Stop' : 'Start',
    search: [t.serverName, String(f.bindPort), f.destHost],
    recency: 0,
  }
}

function quickRow(target: QuickConnectTarget): LauncherRow {
  const name = formatQuickTarget(target)
  return {
    key: `quick:${name}`,
    kind: 'quick',
    id: name,
    name,
    sub: 'Not saved yet · kept under Quick connects',
    env: '',
    look: { icon: '', color: '', group: 'Quick connects' },
    dot: null,
    kindLabel: 'New',
    action: 'Connect',
    target,
    search: [],
    recency: 0,
  }
}

function allRows(data: LauncherData): LauncherRow[] {
  return [
    ...data.servers.map((s) => serverRow(s, data)),
    // A stack with no steps has nothing to launch.
    ...data.stacks.filter((st) => (st.steps?.length ?? 0) > 0).map((st) => stackRow(st, data)),
    ...data.tunnels.map((t) => tunnelRow(t, data)),
  ]
}

// The rows for a query: recently used first when it is empty, best match
// first otherwise. A full `user@host[:port]` puts its saved server — or a row
// that connects to it once — on top, by Quick Connect's identity rule.
export function launcherRows(data: LauncherData, query: string): LauncherRow[] {
  const q = query.trim()
  const rows = allRows(data)
  if (!q) {
    return rows.sort((a, b) => b.recency - a.recency || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, MAX_ROWS)
  }
  const fuse = new Fuse(rows, { keys: [{ name: 'name', weight: 2 }, 'sub', 'kindLabel', 'search'], ...FUZZY_MATCH })
  let hits = fuse.search(q).map((r) => r.item)
  const target = parseQuickConnect(q)
  if (target) {
    const saved = findExistingServer(data.servers, target)
    const top = saved ? serverRow(saved, data) : quickRow(target)
    hits = [top, ...hits.filter((r) => r.key !== top.key)]
  }
  return hits.slice(0, MAX_ROWS)
}

// The ssh command for an unsaved target, for ⌘C.
export function quickCommand(t: QuickConnectTarget): string {
  return `ssh ${t.user}@${t.host}${t.port === 22 ? '' : ` -p ${t.port}`}`
}
