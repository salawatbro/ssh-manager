// Pure helpers for agent keys: labels, short fingerprints and the client-side
// mirror of the backend's AgentKey.Validate (the backend checks again).

// label is the Select option text (Rotate); title, recommended and
// description draw the Generate key type picker.
export const KEY_KINDS = [
  {
    value: 'ed25519',
    label: 'Ed25519 (recommended)',
    title: 'Ed25519',
    recommended: true,
    description: 'Short and fast. Works with GitHub and modern servers.',
  },
  {
    value: 'ecdsa-p256',
    label: 'ECDSA P-256',
    title: 'ECDSA P-256',
    recommended: false,
    description: 'For systems that only accept NIST curves.',
  },
  {
    value: 'rsa-4096',
    label: 'RSA 4096',
    title: 'RSA 4096',
    recommended: false,
    description: 'Only for old servers that refuse Ed25519. Takes a few seconds to create.',
  },
] as const

export type KeyKind = (typeof KEY_KINDS)[number]['value']

export const KEY_NAME_SUGGESTIONS = ['GitHub', 'Work servers', 'Deploy', 'Personal'] as const

const ARROW_STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

// stepKeyKind is the kind an arrow key moves the type picker to, wrapping at
// both ends; null for any other key.
export function stepKeyKind(kind: KeyKind, key: string): KeyKind | null {
  const step = ARROW_STEP[key]
  if (!step) return null
  const at = KEY_KINDS.findIndex((k) => k.value === kind)
  return KEY_KINDS[(at + step + KEY_KINDS.length) % KEY_KINDS.length].value
}

// publicKeyLine is the authorized_keys line a person copies: the key, then
// its comment when it has one.
export function publicKeyLine(k: { publicKey: string; comment: string }): string {
  return k.comment ? `${k.publicKey} ${k.comment}` : k.publicKey
}

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
