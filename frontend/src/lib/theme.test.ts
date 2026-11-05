import { describe, expect, it } from 'vitest'
import { cachedChoice, paletteFor, themeController } from './theme'

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [['zish.theme', initial]] : [])
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

describe('paletteFor', () => {
  it('maps each choice', () => {
    expect(paletteFor('night', true)).toBe('night')
    expect(paletteFor('day', false)).toBe('day')
    expect(paletteFor('auto', true)).toBe('day')
    expect(paletteFor('auto', false)).toBe('night')
  })

  it('falls back to night for anything unknown', () => {
    expect(paletteFor('', true)).toBe('night')
    expect(paletteFor('dusk', true)).toBe('night')
  })
})

describe('cachedChoice', () => {
  it('survives storage that throws or is missing', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      },
    }
    expect(cachedChoice(throwing)).toBe('night')
    expect(cachedChoice(undefined)).toBe('night')
  })
})

describe('themeController', () => {
  it('paints the cached choice before the backend answers', () => {
    const root = { dataset: {} as DOMStringMap }
    themeController({ root, storage: memoryStorage('day') })
    expect(root.dataset.theme).toBe('day')
  })

  it('follows a new choice and caches it', () => {
    const root = { dataset: {} as DOMStringMap }
    const storage = memoryStorage()
    const theme = themeController({ root, storage })
    expect(root.dataset.theme).toBe('night')
    theme.choose('day')
    expect(root.dataset.theme).toBe('day')
    expect(storage.data.get('zish.theme')).toBe('day')
  })

  it('repaints Match macOS when the system flips, and only then', () => {
    const root = { dataset: {} as DOMStringMap }
    const media = { matches: false }
    const theme = themeController({ root, media, storage: memoryStorage('auto') })
    expect(root.dataset.theme).toBe('night')
    media.matches = true
    theme.systemChanged()
    expect(root.dataset.theme).toBe('day')
    theme.choose('night')
    theme.systemChanged()
    expect(root.dataset.theme).toBe('night')
  })
})
