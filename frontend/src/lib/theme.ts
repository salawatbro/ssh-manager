// The palette a window draws. Settings stores the choice; "auto" (Match
// macOS) follows prefers-color-scheme, which the backend's NSApp appearance
// leaves to the system for that choice only.
export type Palette = 'night' | 'day'

export const LIGHT_QUERY = '(prefers-color-scheme: light)'
const STORAGE_KEY = 'zish.theme'

export function paletteFor(choice: string, systemLight: boolean): Palette {
  if (choice === 'day') return 'day'
  if (choice === 'auto' && systemLight) return 'day'
  return 'night'
}

// The last choice this webview saw, so a window paints its palette before
// the settings call returns. Storage can be missing or refuse (vitest, a
// locked-down webview): the choice then waits for the backend.
export function cachedChoice(storage: Pick<Storage, 'getItem'> | undefined): string {
  try {
    return storage?.getItem(STORAGE_KEY) ?? 'night'
  } catch {
    return 'night'
  }
}

export function cacheChoice(storage: Pick<Storage, 'setItem'> | undefined, choice: string) {
  try {
    storage?.setItem(STORAGE_KEY, choice)
  } catch {
    // Cache only: the backend still has the setting.
  }
}

interface ThemeTarget {
  root: { dataset: DOMStringMap }
  media?: Pick<MediaQueryList, 'matches'>
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

// themeController paints the cached choice at once and returns the two
// ways it moves: a new choice from the backend, or the system flipping.
export function themeController({ root, media, storage }: ThemeTarget) {
  let choice = cachedChoice(storage)
  const paint = () => {
    root.dataset.theme = paletteFor(choice, media?.matches ?? false)
  }
  paint()
  return {
    choose(next: string) {
      choice = next
      cacheChoice(storage, next)
      paint()
    },
    systemChanged: paint,
  }
}
