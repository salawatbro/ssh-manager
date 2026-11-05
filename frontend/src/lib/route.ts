import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// The inspector's route lane and On connect card, derived from the jump chain.

// jumpChain walks jumpId from the server outwards and returns the hops root
// first, the server last. A missing or repeated hop ends the walk, so a broken
// or cyclic chain still renders.
export function jumpChain(server: Server, servers: Server[]): Server[] {
  const byId = new Map(servers.map((s) => [s.id, s]))
  const chain = [server]
  const seen = new Set([server.id])
  let next = server.jumpId ? byId.get(server.jumpId) : undefined
  while (next && !seen.has(next.id)) {
    chain.unshift(next)
    seen.add(next.id)
    next = next.jumpId ? byId.get(next.jumpId) : undefined
  }
  return chain
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

// authShort is the auth method in a few words, as the route lane shows it.
export function authShort(s: Server): string {
  switch (s.authType) {
    case AuthType.AuthPassword:
      return 'password'
    case AuthType.AuthKey:
      return s.keyPath ? baseName(s.keyPath) : 'key file'
    case AuthType.AuthZishKey:
      return 'Zish key'
    default:
      return 'system agent'
  }
}

// authLabel is the longer form, for tooltips: method · which credential.
export function authLabel(s: Server, keyName?: string): string {
  switch (s.authType) {
    case AuthType.AuthPassword:
      return 'Password · Keychain'
    case AuthType.AuthKey:
      return s.keyPath ? `Key file · ${s.keyPath}` : 'Key file'
    case AuthType.AuthZishKey:
      return keyName ? `Zish key · ${keyName}` : 'Zish key'
    default:
      return 'System ssh-agent'
  }
}

export interface RouteNode {
  key: string
  name: string
  sub: string
  kind: 'mac' | 'host'
  target: boolean
}

export function routeNodes(chain: Server[]): RouteNode[] {
  const usesZish = chain.some((s) => s.authType === AuthType.AuthZishKey)
  const mac: RouteNode = { key: 'mac', name: 'This Mac', sub: usesZish ? 'Zish agent' : 'ssh client', kind: 'mac', target: false }
  return [
    mac,
    ...chain.map((s, i) => ({
      key: s.id,
      name: s.name,
      sub: `${s.user} · ${authShort(s)}${s.twoFactor ? ' + TOTP' : ''}`,
      kind: 'host' as const,
      target: i === chain.length - 1,
    })),
  ]
}

function secretNeed(s: Server): string | null {
  const base = s.authType === AuthType.AuthPassword ? 'Password' : s.authType === AuthType.AuthKey ? 'Key passphrase' : null
  if (base && s.twoFactor) return `${base} + TOTP`
  if (s.twoFactor) return 'TOTP'
  return base
}

// autoFillText says what Zish answers for the user at connect time. Key
// passphrases are only filled when one is stored; the text cannot know that,
// so it names what would be asked.
export function autoFillText(chain: Server[], autoFill: boolean, touchId: (keyId: string) => boolean): string {
  if (!autoFill) return 'Off — ssh asks in the terminal'
  const target = chain[chain.length - 1]
  const parts: string[] = []
  for (const s of chain) {
    const need = secretNeed(s)
    if (need) parts.push(s === target ? need : `${need} for ${s.name}`)
  }
  if (parts.length > 0) return `${parts.join('; ')}, from Keychain`
  if (target.authType === AuthType.AuthZishKey) {
    return target.agentKeyId && touchId(target.agentKeyId) ? 'Touch ID, then the agent signs' : 'The Zish agent signs'
  }
  if (target.authType === AuthType.AuthAgent) return 'Nothing to fill — ssh-agent signs'
  return 'Nothing to fill'
}
