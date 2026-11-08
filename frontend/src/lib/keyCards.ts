import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { formatRecency } from './relativeTime'

// What a key card on the Keys page says about its key.

// A key this old gets "rotate" until settings load; then
// Settings.rotateReminderDays (0 = never) decides, as in the Security check.
export const ROTATE_AFTER_DAYS = 365

const DAY = 86_400_000

export type FactTone = 'plain' | 'warn' | 'muted'

export interface KeyFact {
  text: string
  tone: FactTone
}

export interface KeyFacts {
  touch: KeyFact
  servers: KeyFact
  age: KeyFact
}

// serversUsingKey lists the servers that sign in with the Zish key, by name.
export function serversUsingKey(keyId: string, servers: Server[]): Server[] {
  return servers
    .filter((s) => s.authType === AuthType.AuthZishKey && s.agentKeyId === keyId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function ageDays(createdAt: string, now: number): number | null {
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / DAY))
}

// keyAge is "today", "3 days old", "8 months old", "2 years old"; '' when the
// date is unknown.
export function keyAge(createdAt: string, now = Date.now()): string {
  const days = ageDays(createdAt, now)
  if (days === null) return ''
  if (days < 1) return 'new today'
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} old`
  if (days < 14) return unit(days, 'day')
  if (days < 60) return unit(Math.floor(days / 7), 'week')
  if (days < 365) return unit(Math.floor(days / 30), 'month')
  return unit(Math.floor(days / 365), 'year')
}

export function rotateDue(createdAt: string, now = Date.now(), afterDays = ROTATE_AFTER_DAYS): boolean {
  const days = ageDays(createdAt, now)
  return afterDays > 0 && days !== null && days >= afterDays
}

// serverList is "a", "a and b" or "a, b and 2 more".
export function serverList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function ageFact(k: AgentKey, now: number, rotateAfter: number): KeyFact {
  const age = keyAge(k.createdAt, now)
  if (rotateDue(k.createdAt, now, rotateAfter)) return { text: `${capitalize(age)} — time to rotate`, tone: 'warn' }
  const recency = formatRecency(k.lastUsedAt)
  const use = recency ? `used ${recency}` : 'never used'
  return { text: age ? `${capitalize(age)} · ${use}` : capitalize(use), tone: 'plain' }
}

// keyFacts are the card's three rows: Touch ID, the servers that sign in with
// the key, and its age and last use.
export function keyFacts(k: AgentKey, users: Server[], now = Date.now(), rotateAfter = ROTATE_AFTER_DAYS): KeyFacts {
  return {
    touch: k.requireConfirm
      ? { text: 'Asks for Touch ID', tone: 'plain' }
      : { text: 'No Touch ID — any app can use it', tone: 'warn' },
    servers: users.length
      ? { text: serverList(users.map((u) => u.name)), tone: 'plain' }
      : { text: 'Not used by a server yet', tone: 'muted' },
    age: ageFact(k, now, rotateAfter),
  }
}

// keyNeedsCare marks the card's tile amber: no Touch ID, due for rotation, or
// RSA.
export function keyNeedsCare(k: AgentKey, now = Date.now(), rotateAfter = ROTATE_AFTER_DAYS): boolean {
  return !k.requireConfirm || rotateDue(k.createdAt, now, rotateAfter) || k.type === 'ssh-rsa'
}
