import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// What a key card on the Keys page says about its key.

// A key this old gets "rotate" until settings load; then
// Settings.rotateReminderDays (0 = never) decides, as in the Security check.
export const ROTATE_AFTER_DAYS = 365

const DAY = 86_400_000

export type ChipTone = 'acc' | 'plain' | 'warn'

export interface KeyChip {
  label: string
  tone: ChipTone
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

// keyChips: Touch ID, who uses the key, its age. Warnings use the warn tone.
export function keyChips(k: AgentKey, users: Server[], now = Date.now(), rotateAfter = ROTATE_AFTER_DAYS): KeyChip[] {
  const chips: KeyChip[] = [k.requireConfirm ? { label: 'Touch ID', tone: 'acc' } : { label: 'no Touch ID', tone: 'warn' }]
  if (users.length > 0) chips.push({ label: users.length === 1 ? users[0].name : `${users.length} servers`, tone: 'plain' })
  else chips.push({ label: k.lastUsedAt ? 'no servers' : 'never used', tone: 'plain' })
  const age = keyAge(k.createdAt, now)
  if (age) chips.push(rotateDue(k.createdAt, now, rotateAfter) ? { label: `${age} · rotate`, tone: 'warn' } : { label: age, tone: 'plain' })
  return chips
}

// keyNeedsCare marks the card's tile amber: no Touch ID, due for rotation, or
// RSA.
export function keyNeedsCare(k: AgentKey, now = Date.now(), rotateAfter = ROTATE_AFTER_DAYS): boolean {
  return !k.requireConfirm || rotateDue(k.createdAt, now, rotateAfter) || k.type === 'ssh-rsa'
}
