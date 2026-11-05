// A global shortcut, stored canonically as "alt+cmd+1". Mirrors
// domain.ParseShortcut: one letter or digit with at least two modifiers, one
// of them ⌘ or ⌥, so a shortcut never steals plain typing or readline's Ctrl
// keys in other apps. The launcher may also use Space with ⌘ or ⌥ alone
// (domain.ParseLauncherShortcut).

const ORDER = ['ctrl', 'alt', 'shift', 'cmd'] as const
const SYMBOL: Record<string, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘', space: 'Space' }
export const TOGGLE_SHORTCUT = 'shift+cmd+s'
export const DEFAULT_LAUNCHER_SHORTCUT = 'alt+space'

// space: the field records the launcher's shortcut, which may use Space.
export interface ShortcutRules {
  space?: boolean
}

export interface KeyLike {
  code: string
  metaKey: boolean
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

// The key from its position (KeyA, Digit1), like the Carbon hot key: ⌥ turns
// the typed character into ¡ or å, the code stays the same.
function keyOf(code: string, rules: ShortcutRules): string | null {
  if (code === 'Space') return rules.space ? 'space' : null
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code)
  return m ? (m[1] ?? m[2]).toLowerCase() : null
}

export type Recorded = { shortcut: string } | { error: string } | { pending: true }

// What a keydown in the shortcut field means: a shortcut, a reason it is not
// one, or modifiers still being held.
export function recordShortcut(e: KeyLike, rules: ShortcutRules = {}): Recorded {
  const mods = ORDER.filter((m) => (m === 'ctrl' ? e.ctrlKey : m === 'alt' ? e.altKey : m === 'shift' ? e.shiftKey : e.metaKey))
  const key = keyOf(e.code, rules)
  if (!key) {
    if (/^(Meta|Alt|Control|Shift)/.test(e.code)) return { pending: true }
    return { error: rules.space ? 'Use Space, a letter or a digit.' : 'Use a letter or a digit.' }
  }
  const shortcut = [...mods, key].join('+')
  const err = shortcutError(shortcut)
  return err ? { error: err } : { shortcut }
}

export function shortcutError(sc: string): string | null {
  const parts = sc.split('+')
  const mods = parts.slice(0, -1)
  const hasCmdOrAlt = mods.includes('cmd') || mods.includes('alt')
  if (parts[parts.length - 1] === 'space') {
    if (!hasCmdOrAlt) return 'Hold ⌘ or ⌥ with Space.'
  } else if (mods.length < 2 || !hasCmdOrAlt) {
    return 'Hold at least two of ⌃ ⌥ ⇧ ⌘, one of them ⌘ or ⌥.'
  }
  if (sc === TOGGLE_SHORTCUT) return '⇧⌘S already shows and hides Zish.'
  return null
}

// "alt+cmd+1" → "⌥⌘1".
export function shortcutLabel(sc: string): string {
  if (!sc) return ''
  return sc
    .split('+')
    .map((p) => SYMBOL[p] ?? p.toUpperCase())
    .join('')
}
