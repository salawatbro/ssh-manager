import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyAge, rotateDue } from './keyCards'
import { keyTypeLabel } from './keyFormat'
import { formatRecency } from './relativeTime'

// What the key details sheet says about its key.

type KeyFacts = Pick<AgentKey, 'type' | 'bits' | 'createdAt' | 'lastUsedAt'>

// keyMeta is the header's line: "Ed25519 · 8 months old · used 2h ago",
// "Ed25519 · created today · never used". Reads the clock.
export function keyMeta(k: KeyFacts): string {
  const age = keyAge(k.createdAt)
  const used = formatRecency(k.lastUsedAt)
  return [keyTypeLabel(k.type, k.bits), age === 'new today' ? 'created today' : age, used ? `used ${used}` : 'never used']
    .filter(Boolean)
    .join(' · ')
}

// rotateCadence words Settings.rotateReminderDays: "every 6 months",
// "every year", "every 2 years", "every 45 days"; null when reminders are off.
export function rotateCadence(days: number): string | null {
  if (days <= 0) return null
  if (days % 365 === 0) return days === 365 ? 'every year' : `every ${days / 365} years`
  if (days % 30 === 0) return days === 30 ? 'every month' : `every ${days / 30} months`
  return `every ${days} days`
}

// rotateDueText is the Rotate row's warning, "8 months old — Zish suggests a
// new key every 6 months."; null when the key is not due or reminders are off.
export function rotateDueText(createdAt: string, reminderDays: number, now = Date.now()): string | null {
  const cadence = rotateCadence(reminderDays)
  if (!cadence || !rotateDue(createdAt, now, reminderDays)) return null
  const age = keyAge(createdAt, now)
  return `${age.charAt(0).toUpperCase()}${age.slice(1)} — Zish suggests a new key ${cadence}.`
}
