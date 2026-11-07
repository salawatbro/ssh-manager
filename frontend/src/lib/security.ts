import type { SecurityCheck, SecurityReport } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { formatRecency } from './relativeTime'

// What the Security page derives from SecurityService.Run's report.

export type FixKind =
  | 'move-to-key'
  | 'require-touch-id'
  | 'use-touch-id'
  | 'idle-lock'
  | 'open-settings-lock'
  | 'open-settings-keys'
  | 'rotate-key'
  | 'show-keys'
  | 'edit-server'
  | 'show-server'

export interface Fix {
  kind: FixKind
  label: string
}

export interface LockContext {
  hasPin: boolean
  lockEnabled: boolean
  biometricsAvailable: boolean
}

// The idle wait the inline idle-lock fix sets, in minutes.
export const FIX_IDLE_MINUTES = 10

const itemsOf = (c: SecurityCheck) => c.items ?? []

// fixFor is the card's main button: an inline fix where Zish can make the
// change itself, otherwise the place where the user can. null = chips only.
export function fixFor(c: SecurityCheck, lock: LockContext): Fix | null {
  const one = itemsOf(c).length === 1
  const lockOn = lock.hasPin && lock.lockEnabled
  switch (c.id) {
    case 'password-servers':
    case 'jump-keys':
      return { kind: 'move-to-key', label: 'Move to a Zish key' }
    case 'keys-touch-id':
      return { kind: 'require-touch-id', label: 'Require Touch ID' }
    case 'key-age':
    case 'rsa-keys':
      return one ? { kind: 'rotate-key', label: 'Rotate key' } : { kind: 'show-keys', label: 'Show keys' }
    case 'prod-two-factor':
      return one ? { kind: 'edit-server', label: 'Edit server' } : null
    case 'known-hosts':
      return one ? { kind: 'show-server', label: 'Show server' } : null
    case 'app-lock':
      return lockOn && lock.biometricsAvailable
        ? { kind: 'use-touch-id', label: 'Use Touch ID' }
        : { kind: 'open-settings-lock', label: 'Open settings' }
    case 'idle-lock':
      return lockOn
        ? { kind: 'idle-lock', label: `Lock after ${FIX_IDLE_MINUTES} minutes` }
        : { kind: 'open-settings-lock', label: 'Open settings' }
    case 'agent-socket':
      return { kind: 'open-settings-keys', label: 'Open settings' }
  }
  return null
}

export interface Issue {
  check: SecurityCheck
  // Set once an inline fix made the check pass; the card stays, ticked,
  // until the page is left or checked again.
  doneText: string | null
}

// A fixed check keeps the card it had before the fix, as the board does.
export interface Fixed {
  check: SecurityCheck
  text: string
}

export interface SecurityView {
  issues: Issue[]
  passing: SecurityCheck[]
  ignored: SecurityCheck[]
  open: number
}

// splitChecks sorts the report into the page's three lists.
export function splitChecks(report: SecurityReport | null, fixed: Record<string, Fixed> = {}): SecurityView {
  const view: SecurityView = { issues: [], passing: [], ignored: [], open: 0 }
  for (const c of report?.checks ?? []) {
    const f = fixed[c.id]
    if (c.ok && f) view.issues.push({ check: f.check, doneText: f.text })
    else if (c.ok) view.passing.push(c)
    else if (c.ignored) view.ignored.push(c)
    else {
      view.issues.push({ check: c, doneText: null })
      view.open++
    }
  }
  return view
}

// openCount is the sidebar badge: failing checks the user has not ignored.
export function openCount(report: SecurityReport | null): number {
  return (report?.checks ?? []).filter((c) => !c.ok && !c.ignored).length
}

export function verdict(open: number, ignored: number): { text: string; tone: 'ok' | 'warn' } {
  if (open > 0) return { text: open === 1 ? '1 thing to fix' : `${open} things to fix`, tone: 'warn' }
  if (ignored > 0) return { text: `Nothing left to fix · ${ignored} ignored`, tone: 'ok' }
  return { text: 'Everything checks out', tone: 'ok' }
}

// segments are the score bar: one per check, filled for each passing one.
export function segments(score: number, total: number): boolean[] {
  return Array.from({ length: Math.max(0, total) }, (_, i) => i < score)
}

// withIgnored adds or removes a check id in Settings.securityIgnored.
export function withIgnored(csv: string, id: string, ignore: boolean): string {
  const ids = csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== id)
  if (ignore) ids.push(id)
  return ids.join(',')
}

export function checkedLabel(checkedAt: string | undefined): string {
  const when = checkedAt ? formatRecency(checkedAt) : ''
  return when ? `Checked ${when}` : 'Not checked yet'
}

// Settings.rotateReminderDays choices; the backend accepts only these.
export const ROTATE_CHOICES: { value: number; label: string }[] = [
  { value: 180, label: 'After 6 months' },
  { value: 365, label: 'After 1 year' },
  { value: 730, label: 'After 2 years' },
  { value: 0, label: 'Never' },
]
