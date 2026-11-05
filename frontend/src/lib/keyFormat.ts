// Pure helpers for agent keys: labels, short fingerprints and the client-side
// mirror of the backend's AgentKey.Validate (the backend checks again).

export const KEY_KINDS = [
  { value: 'ed25519', label: 'Ed25519 (recommended)' },
  { value: 'ecdsa-p256', label: 'ECDSA P-256' },
  { value: 'rsa-4096', label: 'RSA 4096' },
] as const

export type KeyKind = (typeof KEY_KINDS)[number]['value']

const CURVES: Record<string, string> = {
  'ecdsa-sha2-nistp256': 'P-256',
  'ecdsa-sha2-nistp384': 'P-384',
  'ecdsa-sha2-nistp521': 'P-521',
}

// keyTypeLabel turns an ssh key type into what a person calls it.
export function keyTypeLabel(type: string, bits = 0): string {
  if (type === 'ssh-ed25519') return 'Ed25519'
  if (CURVES[type]) return `ECDSA ${CURVES[type]}`
  if (type === 'ssh-rsa') return bits ? `RSA ${bits}` : 'RSA'
  if (type === 'ecdsa') return 'ECDSA'
  return type || 'Unknown'
}

// shortFingerprint keeps "SHA256:" and the first 12 characters of the hash.
export function shortFingerprint(fp: string): string {
  const prefix = 'SHA256:'
  if (!fp.startsWith(prefix)) return fp
  const hash = fp.slice(prefix.length)
  return hash.length > 12 ? `${prefix}${hash.slice(0, 12)}…` : fp
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

// keyNameError mirrors domain.ValidateKeyName: 1–64 characters, no control
// characters. null when valid.
export function keyNameError(name: string): string | null {
  const n = [...name.trim()].length
  if (n < 1 || n > 64) return 'Key name must be 1 to 64 characters.'
  if (CONTROL.test(name)) return 'Key name must not contain control characters.'
  return null
}

// keyCommentError mirrors domain.ValidateKeyComment: at most 256 bytes, no
// control characters (a newline would add an authorized_keys line).
export function keyCommentError(comment: string): string | null {
  if (new TextEncoder().encode(comment.trim()).length > 256) return 'Key comment must be at most 256 bytes.'
  if (CONTROL.test(comment)) return 'Key comment must not contain control characters.'
  return null
}
