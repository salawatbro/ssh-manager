import type { ITheme } from '@xterm/xterm'

function v(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// graphiteTheme builds xterm's theme from the --term-* CSS variables so
// tokens.css (mirrored from the design brief) stays the one source of truth.
export function graphiteTheme(): ITheme {
  return {
    background: v('--term-bg'),
    foreground: v('--term-fg'),
    cursor: v('--term-cursor'),
    cursorAccent: v('--term-cursor-accent'),
    selectionBackground: v('--term-selection'),
    black: v('--term-black'),
    brightBlack: v('--term-bright-black'),
    red: v('--term-red'),
    brightRed: v('--term-bright-red'),
    green: v('--term-green'),
    brightGreen: v('--term-bright-green'),
    yellow: v('--term-yellow'),
    brightYellow: v('--term-bright-yellow'),
    blue: v('--term-blue'),
    brightBlue: v('--term-bright-blue'),
    magenta: v('--term-magenta'),
    brightMagenta: v('--term-bright-magenta'),
    cyan: v('--term-cyan'),
    brightCyan: v('--term-bright-cyan'),
    white: v('--term-white'),
    brightWhite: v('--term-bright-white'),
  }
}

// findDecorations builds addon-search's decoration options from the same
// tokens.css variables graphiteTheme() reads, so the highlight colours cannot
// drift from the palette. The return type is inferred on purpose: the addon
// declares ISearchDecorationOptions but does not export it.
export function findDecorations() {
  return {
    matchBackground: v('--term-find-match'),
    matchOverviewRuler: v('--term-find-match-ruler'),
    activeMatchBackground: v('--term-find-active'),
    activeMatchColorOverviewRuler: v('--term-find-active-ruler'),
  }
}
