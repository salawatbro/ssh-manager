import type { ApprovalRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

// Wording for Zish's own Touch ID request (the approval window).

export type ApprovalLength = 'once' | '15m' | 'lock'

export const LENGTHS: { value: ApprovalLength; label: string }[] = [
  { value: 'once', label: 'Just once' },
  { value: '15m', label: 'For 15 minutes' },
  { value: 'lock', label: 'Until Zish locks' },
]

export function toLength(v: string): ApprovalLength {
  return v === '15m' || v === 'lock' ? v : 'once'
}

// knownServer: the destination is a server saved in Zish (it has an
// environment), not a bare host key or nothing at all.
export function knownServer(r: ApprovalRequest): boolean {
  return r.env !== '' && r.server !== ''
}

export function approvalTitle(r: ApprovalRequest): string {
  if (knownServer(r)) return `Sign in to ${r.server}?`
  return `Use ${r.keyName}?`
}

// askedBy is "An ssh in iTerm wants to use"; the key name follows in bold.
export function askedBy(r: ApprovalRequest): string {
  if (r.inProcess) return `Zish (${r.chain || 'its own connection'}) wants to use`
  const who = r.client || 'An unknown process'
  // "An ssh": initialisms read out by letter take "an" too.
  const article = /^([aeiou]|ssh|sftp|scp|rsync|x)/i.test(who) ? 'An' : 'A'
  const app = r.app && r.app.toLowerCase() !== who.toLowerCase() ? ` in ${r.app}` : ''
  return `${r.client ? `${article} ${who}` : who}${app} wants to use`
}

// serverLine is what the Server row shows: the address of a Zish server,
// else whatever the agent knows about the destination.
export function serverLine(r: ApprovalRequest): string {
  if (knownServer(r)) return r.address || r.server
  return r.server || 'Not known: the program did not say'
}

// routeLine is "via bastion", "direct", or '' when there is nothing to show.
export function routeLine(r: ApprovalRequest): string {
  const via = r.via ?? []
  if (via.length > 0) return `via ${via.join(' → ')}`
  return knownServer(r) ? 'direct' : ''
}

export function approveLabel(r: ApprovalRequest): string {
  return r.touchId ? 'Approve with Touch ID' : 'Approve'
}

// lengthNote explains why only "Just once" is offered.
export function lengthNote(r: ApprovalRequest): string {
  if (r.grantable) return ''
  if (r.env === 'prod') return 'Production servers ask every time.'
  return 'This request can be approved once only.'
}

// A stack launch asks once for every key its servers and tunnels use.
export function stackTitle(r: ApprovalRequest): string {
  return `Open the stack “${r.stack}”?`
}

// "the key deploy" / "the keys deploy and ops" / "the keys a, b and c".
export function keysPhrase(r: ApprovalRequest): string {
  const keys = r.keyName.split(', ').filter(Boolean)
  if (keys.length <= 1) return `the key ${keys[0] ?? r.keyName}`
  return `the keys ${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`
}

export function stackHasProd(r: ApprovalRequest): boolean {
  return (r.stackServers ?? []).some((s) => s.env === 'prod')
}
