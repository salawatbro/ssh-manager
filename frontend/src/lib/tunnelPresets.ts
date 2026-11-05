import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Tint } from './look'

// The New tunnel sheet's three kinds, in the board's order.
export interface TunnelType {
  type: ForwardType
  title: string
  flag: string
  sub: string
}

export const TUNNEL_TYPES: readonly TunnelType[] = [
  { type: ForwardType.ForwardLocal, title: 'Local', flag: '-L', sub: 'Reach a server port from this Mac' },
  { type: ForwardType.ForwardRemote, title: 'Remote', flag: '-R', sub: 'Let the server reach this Mac' },
  { type: ForwardType.ForwardDynamic, title: 'SOCKS', flag: '-D', sub: 'Browse through the server' },
]

// A common service: one port on both ends, a name, and a look for the tile.
export interface TunnelPreset {
  id: string
  label: string
  port: number
  name: string
  icon: string
  color: Tint
}

export const TUNNEL_PRESETS: readonly TunnelPreset[] = [
  { id: 'postgres', label: 'Postgres', port: 5432, name: 'postgres', icon: 'database', color: 'blue' },
  { id: 'mysql', label: 'MySQL', port: 3306, name: 'mysql', icon: 'database', color: 'amber' },
  { id: 'redis', label: 'Redis', port: 6379, name: 'redis', icon: 'layers', color: 'red' },
  { id: 'web', label: 'Web', port: 8080, name: 'admin-ui', icon: 'globe', color: 'teal' },
  { id: 'kubernetes', label: 'Kubernetes', port: 6443, name: 'k8s-api', icon: 'box', color: 'sky' },
]

// The tile a tunnel gets when no preset names it; '' colour = auto (gray).
export const PLAIN_TUNNEL_LOOK = { icon: 'plug', color: '' }

export function presetById(id: string): TunnelPreset | undefined {
  return TUNNEL_PRESETS.find((p) => p.id === id)
}
