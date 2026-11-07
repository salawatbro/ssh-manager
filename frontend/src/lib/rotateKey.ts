import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { RotateResult } from '@bindings/github.com/salawat/sshmgr/internal/service'

// "Rotate key": a new key takes the old one's place on every server that
// uses it, and the old key leaves those servers' authorized_keys.

export type RotateTone = 'busy' | 'ok' | 'warn' | 'bad'

export interface RotateState {
  tone: RotateTone
  text: string
}

// rotatedName is the old name with this year, e.g. "work 2026"; a trailing
// year on the old name is replaced, and a taken name gets " (2)", " (3)"…
export function rotatedName(old: AgentKey, keys: AgentKey[], year: number): string {
  const taken = new Set(keys.map((k) => k.name.toLowerCase()))
  const base = old.name.replace(/\s+\d{4}$/, '').slice(0, 52)
  let name = `${base} ${year}`
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${year} (${i})`
  return name
}

// A server counts as moved once it signs in with the new key, even if the
// old key could not be taken off it.
export const moved = (st: RotateState | undefined) => st?.tone === 'ok' || st?.tone === 'warn'

export interface RotateDeps {
  rotate: (serverId: string) => Promise<RotateResult | null>
  onState: (serverId: string, st: RotateState) => void
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// rotateServers goes one server at a time: each may ask for Touch ID for
// both keys, and two prompts at once would be confusing.
export async function rotateServers(servers: Server[], deps: RotateDeps): Promise<void> {
  for (const s of servers) {
    deps.onState(s.id, { tone: 'busy', text: 'Rotating…' })
    try {
      const r = await deps.rotate(s.id)
      if (r?.oldKeyRemoved) deps.onState(s.id, { tone: 'ok', text: 'On the new key. The old key is removed.' })
      else deps.onState(s.id, { tone: 'warn', text: `On the new key. ${r?.note ?? ''}`.trim() })
    } catch (e) {
      deps.onState(s.id, { tone: 'bad', text: msg(e) })
    }
  }
}
