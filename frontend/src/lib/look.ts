// The look of a server or tunnel: an icon (or letters) on a tinted tile. The
// tint is decoration only — status and environment keep their own marks, so a
// tint never stands for either. Path data is 24×24, stroke-drawn (lucide).

export interface IconDef {
  id: string
  label: string
  d: string
}

export const ICONS: readonly IconDef[] = [
  { id: 'server', label: 'Server', d: 'M4 3h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM4 13h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM6 7h.01M6 17h.01' },
  { id: 'database', label: 'Database', d: 'M3 5a9 3 0 1 0 18 0a9 3 0 1 0-18 0M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0' },
  { id: 'globe', label: 'Website', d: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20M2 12h20' },
  { id: 'cloud', label: 'Cloud', d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' },
  { id: 'box', label: 'Container', d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16ZM3.3 7 12 12l8.7-5M12 22V12' },
  { id: 'layers', label: 'Cache', d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' },
  { id: 'shield', label: 'Bastion', d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
  { id: 'rocket', label: 'Deploy', d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' },
  { id: 'cpu', label: 'Worker', d: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6v6H9zM15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2' },
  { id: 'terminal', label: 'Shell', d: 'M4 17l6-6-6-6M12 19h8' },
  { id: 'code', label: 'Code', d: 'M16 18l6-6-6-6M8 6l-6 6 6 6' },
  { id: 'git', label: 'Git', d: 'M6 3v12M15 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 9a9 9 0 0 1-9 9' },
  { id: 'chart', label: 'Monitoring', d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { id: 'monitor', label: 'Dashboard', d: 'M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4' },
  { id: 'mail', label: 'Mail', d: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' },
  { id: 'inbox', label: 'Queue', d: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' },
  { id: 'search', label: 'Search', d: 'M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0M21 21l-4.3-4.3' },
  { id: 'lock', label: 'Vault', d: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4' },
  { id: 'plug', label: 'Proxy', d: 'M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z' },
  { id: 'wifi', label: 'Network', d: 'M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.859a10 10 0 0 1 14 0M8.5 16.429a5 5 0 0 1 7 0' },
  { id: 'home', label: 'Home', d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'flask', label: 'Test', d: 'M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2M8.5 2h7M7 16h10' },
  { id: 'bolt', label: 'Fast', d: 'M13 2 4 14h7l-1 8 9-12h-7z' },
  { id: 'star', label: 'Favourite', d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' },
]

const ICON_BY_ID = new Map(ICONS.map((i) => [i.id, i]))

export function iconById(id: string): IconDef | undefined {
  return ICON_BY_ID.get(id)
}

export const TINTS = [
  'gray', 'red', 'orange', 'amber', 'lime', 'green', 'teal', 'sky', 'blue', 'violet', 'pink', 'fuchsia',
] as const

export type Tint = (typeof TINTS)[number]

export function isTint(v: string): v is Tint {
  return (TINTS as readonly string[]).includes(v)
}

// Gray is the "no group" tint, so auto never hands it to a named group.
const AUTO_TINTS = TINTS.filter((t) => t !== 'gray')

// autoColor gives a group a stable tint: the same name always lands on the
// same colour, across launches and machines, without storing anything.
export function autoColor(group: string): Tint {
  const key = group.trim().toLowerCase()
  if (key === '') return 'gray'
  let h = 2166136261
  for (const ch of key) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return AUTO_TINTS[(h >>> 0) % AUTO_TINTS.length]
}

// resolveTint turns a stored colour (empty or unknown = auto) into a tint.
export function resolveTint(color: string, group: string): Tint {
  return isTint(color) ? color : autoColor(group)
}

export function tintVars(tint: Tint): { fg: string; bg: string } {
  return { fg: `var(--color-t-${tint})`, bg: `var(--color-t-${tint}-bg)` }
}

// defaultLetters: initials of the first two words ("api-prod" → "AP"), or the
// first two characters of a single word ("nas" → "NA"). Code points, not UTF-16
// units, so a non-Latin or astral first letter is never split in half.
export function defaultLetters(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (words.length === 0) return '?'
  const picked =
    words.length >= 2
      ? [Array.from(words[0])[0], Array.from(words[1])[0]]
      : Array.from(words[0]).slice(0, 2)
  return picked.join('').toUpperCase()
}

export type LookMark = { kind: 'icon'; d: string; label: string } | { kind: 'letters'; text: string }

// A stored icon is an icon id, '' (letters from the name), or this prefix plus
// the user's own letters or emoji.
export const LETTERS_PREFIX = 'letters:'

export function customLetters(icon: string): string | null {
  return icon.startsWith(LETTERS_PREFIX) && icon.length > LETTERS_PREFIX.length ? icon.slice(LETTERS_PREFIX.length) : null
}

// lettersIcon keeps at most two user-perceived characters, so a flag or a
// skin-toned emoji survives whole; whitespace is dropped.
export function lettersIcon(text: string): string {
  const clean = text.replace(/\s+/gu, '')
  const kept = graphemes(clean).slice(0, 2).join('')
  return kept ? LETTERS_PREFIX + kept : ''
}

function graphemes(s: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (g) => g.segment)
  }
  return Array.from(s)
}

// markOf: a known icon id draws that icon, custom letters draw themselves, and
// anything else (empty included) falls back to letters from the name.
export function markOf(icon: string, name: string): LookMark {
  const def = iconById(icon)
  if (def) return { kind: 'icon', d: def.d, label: def.label }
  return { kind: 'letters', text: customLetters(icon) ?? defaultLetters(name) }
}
