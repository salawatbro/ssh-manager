import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { jumpChain } from './route'

// What a forward:status state means for a row on the Tunnels page.
export type RowState = 'running' | 'failed' | 'retrying' | 'stopped'

export function rowState(state: string | undefined): RowState {
  if (state === 'running') return 'running'
  if (state === 'error') return 'failed'
  if (state === 'retrying') return 'retrying'
  return 'stopped'
}

// The switch is on while the tunnel runs or Zish is bringing it back.
export const wanted = (s: RowState) => s === 'running' || s === 'retrying'

export const TYPE_FLAG: Record<string, string> = {
  [ForwardType.ForwardLocal]: '-L',
  [ForwardType.ForwardRemote]: '-R',
  [ForwardType.ForwardDynamic]: '-D',
}

// The route cell: where it listens → where the traffic goes.
export function tunnelRoute(f: PortForward): string {
  const listen = `${f.bindAddr || '127.0.0.1'}:${f.bindPort}`
  if (f.type === ForwardType.ForwardDynamic) return `${listen} → SOCKS`
  if (f.type === ForwardType.ForwardRemote) return `server :${f.bindPort} → ${f.destHost}:${f.destPort}`
  return `${listen} → ${f.destHost}:${f.destPort}`
}

// "db-primary · via bastion" — the server and the hops before it.
export function serverLine(serverId: string, fallbackName: string, servers: Server[]): string {
  const server = servers.find((s) => s.id === serverId)
  if (!server) return fallbackName
  const hops = jumpChain(server, servers).slice(0, -1)
  return hops.length ? `${server.name} · via ${hops.map((h) => h.name).join(' › ')}` : server.name
}

// Bytes the way Finder writes them: 1000-based, one decimal under ten.
export function formatBytes(n: number): string {
  if (n < 1000) return `${Math.max(0, Math.round(n))} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1000
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)} ${units[i]}`
}

export const SPARK_BARS = 12
const SPARK_MIN = 2
const SPARK_MAX = 18

// Bar heights in px for the 10-minute sparkline, scaled to the row's busiest
// interval. A tunnel that isn't running draws a flat line.
export function sparkHeights(buckets: number[] | null | undefined, running: boolean): number[] {
  const b = Array.from({ length: SPARK_BARS }, (_, i) => buckets?.[buckets.length - SPARK_BARS + i] ?? 0)
  const max = Math.max(...b)
  if (!running || max <= 0) return b.map(() => SPARK_MIN)
  return b.map((v) => SPARK_MIN + Math.round(((SPARK_MAX - SPARK_MIN) * v) / max))
}

// The traffic cell's text.
export function trafficText(state: RowState, total: number): string {
  if (state === 'running') return formatBytes(total)
  if (state === 'failed') return 'failed'
  if (state === 'retrying') return 'retrying'
  return 'off'
}

export interface Counts {
  running: number
  failed: number
  total: number
}

export function tunnelCounts(ids: string[], stateOf: (id: string) => string | undefined): Counts {
  let running = 0
  let failed = 0
  for (const id of ids) {
    const s = rowState(stateOf(id))
    if (s === 'running') running++
    else if (s === 'failed') failed++
  }
  return { running, failed, total: ids.length }
}

// The page a -L tunnel serves, for "Open in browser".
export function localUrl(f: PortForward): string | null {
  if (f.type !== ForwardType.ForwardLocal) return null
  const host = !f.bindAddr || f.bindAddr === '0.0.0.0' || f.bindAddr === '127.0.0.1' ? 'localhost' : f.bindAddr
  return `http://${host}:${f.bindPort}`
}

// The busy-port line: "Port 6379 on this Mac is held by redis-server (pid 4121)."
export function busyText(port: number, owner: string): string {
  return owner ? `Port ${port} on this Mac is held by ${owner}.` : `Port ${port} on this Mac is already in use.`
}

// The note under the tunnels table, following Settings › Tunnels.
export function tunnelsFooter(reconnect: boolean, keepWhileLocked: boolean): string {
  const back = reconnect
    ? 'Tunnels with reconnect on come back after sleep and Wi-Fi changes.'
    : 'Reconnect is off in Settings › Tunnels, so a tunnel that drops stays down.'
  if (!keepWhileLocked) return `${back} Locking Zish stops them; closing its window does not.`
  const after = reconnect ? '; one that drops while locked comes back after unlock' : ''
  return `${back} They keep running while Zish is locked or its window is closed${after}.`
}
