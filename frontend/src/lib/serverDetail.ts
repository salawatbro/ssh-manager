import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Status } from './status'

// Pure derivations for the server detail page (dizayn manbasi: Zish.dc.html
// `isDetail`). Kept out of the components so the strings are unit-testable and
// so the page stays inside the 250-line cap.

export interface DetailField {
  label: string
  value: string
  /** Machine-shaped values render in the mono family. */
  mono: boolean
}

const AUTH_LABEL: Record<string, string> = {
  [AuthType.AuthKey]: 'SSH key',
  [AuthType.AuthPassword]: 'Password · macOS keychain',
  [AuthType.AuthAgent]: 'Agent',
}

// The design shows "SSH key · ~/.ssh/id_ed25519" — the method, then the detail
// that identifies WHICH credential, when there is one.
export function authLabel(s: Server): string {
  const base = AUTH_LABEL[s.authType] ?? String(s.authType)
  return s.authType === AuthType.AuthKey && s.keyPath ? `${base} · ${s.keyPath}` : base
}

// The command the user would type by hand — shown for copying, so it must be
// literally runnable: -i only with a key, -p only off the default port.
export function sshCommand(s: Server): string {
  const parts = ['ssh']
  if (s.authType === AuthType.AuthKey && s.keyPath) parts.push('-i', s.keyPath)
  if (s.port && s.port !== 22) parts.push('-p', String(s.port))
  parts.push(`${s.user}@${s.host}`)
  return parts.join(' ')
}

const STATUS_LABEL: Record<Status, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  failed: 'Last attempt failed',
  disc: 'Not connected',
  unknown: 'Unknown',
}

const STATUS_TEXT_CLASS: Record<Status, string> = {
  connected: 'text-stConnected',
  connecting: 'text-stConnecting',
  failed: 'text-stFailed',
  disc: 'text-textDim',
  unknown: 'text-textDim',
}

export function statusLabel(status: Status): string {
  return STATUS_LABEL[status]
}

export function statusTextClass(status: Status): string {
  return STATUS_TEXT_CLASS[status]
}

// `2026-07-29T09:22:00Z` → `29 Jul 09:22`; a null/absent stamp reads "never".
// Deliberately not relative ("2 hours ago"): the detail page is where a user
// checks exactly when something last happened.
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'never'
  const day = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${hh}:${mm}`
}

// `2026-07-29T…` → `29 Jul 2026`, for the "Added" row where the time of day
// carries no information.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`
}

// The CONNECTION card's eight rows, in the design's order. `jumpName` is
// resolved by the caller (the store holds the jump host as an id).
export function detailFields(s: Server, jumpName: string | null): DetailField[] {
  return [
    { label: 'Host', value: s.host, mono: true },
    { label: 'Port', value: String(s.port || 22), mono: true },
    { label: 'User', value: s.user, mono: true },
    { label: 'Authentication', value: authLabel(s), mono: false },
    { label: 'Jump host', value: jumpName ?? 'None — direct', mono: false },
    { label: 'Two-factor', value: s.twoFactor ? 'TOTP required' : 'Off', mono: false },
    { label: 'Added', value: formatDate(s.createdAt), mono: false },
    { label: 'Last connected', value: formatStamp(s.lastUsedAt), mono: true },
  ]
}
