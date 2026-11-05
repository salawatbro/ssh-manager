import { describe, expect, it } from 'vitest'
import { ICONS, TINTS, autoColor, customLetters, defaultLetters, iconById, isTint, lettersIcon, markOf, resolveTint, tintVars } from './look'

describe('icons', () => {
  it('has 24 icons with unique ids and path data', () => {
    expect(ICONS).toHaveLength(24)
    expect(new Set(ICONS.map((i) => i.id)).size).toBe(ICONS.length)
    for (const i of ICONS) expect(i.d).toMatch(/^M/)
  })

  it('looks icons up by id', () => {
    expect(iconById('database')?.label).toBe('Database')
    expect(iconById('nope')).toBeUndefined()
  })
})

describe('tints', () => {
  it('has the twelve tints', () => {
    expect(TINTS).toHaveLength(12)
    expect(isTint('violet')).toBe(true)
    expect(isTint('auto')).toBe(false)
    expect(isTint('')).toBe(false)
  })

  it('maps a tint to its CSS variables', () => {
    expect(tintVars('sky')).toEqual({ fg: 'var(--color-t-sky)', bg: 'var(--color-t-sky-bg)' })
  })
})

describe('autoColor', () => {
  it('is gray without a group', () => {
    expect(autoColor('')).toBe('gray')
    expect(autoColor('   ')).toBe('gray')
  })

  it('is stable and ignores case and padding', () => {
    expect(autoColor('Production')).toBe(autoColor('production'))
    expect(autoColor(' Home lab ')).toBe(autoColor('home lab'))
  })

  it('never gives a named group gray', () => {
    for (const g of ['Production', 'Staging', 'Home lab', 'Clients', 'k8s', 'Сервера', 'a', 'b', 'c', 'd'])
      expect(autoColor(g)).not.toBe('gray')
  })

  it('spreads different groups over several tints', () => {
    const groups = ['Production', 'Staging', 'Home lab', 'Clients', 'Databases', 'Workers', 'Edge', 'Lab']
    expect(new Set(groups.map(autoColor)).size).toBeGreaterThanOrEqual(4)
  })
})

describe('resolveTint', () => {
  it('keeps a stored tint and falls back to auto otherwise', () => {
    expect(resolveTint('blue', 'Production')).toBe('blue')
    expect(resolveTint('', 'Production')).toBe(autoColor('Production'))
    expect(resolveTint('magenta', 'Staging')).toBe(autoColor('Staging'))
  })
})

describe('defaultLetters', () => {
  it.each([
    ['api-prod', 'AP'],
    ['db primary', 'DP'],
    ['nas', 'NA'],
    ['x', 'X'],
    ['web_staging.eu', 'WS'],
    ['сервер', 'СЕ'],
    ['  --  ', '?'],
    ['', '?'],
  ])('%j → %s', (name, want) => {
    expect(defaultLetters(name)).toBe(want)
  })

  it('never splits an astral character', () => {
    expect(defaultLetters('𝒳yz')).toBe('𝒳Y')
  })
})

describe('markOf', () => {
  it('draws a known icon', () => {
    expect(markOf('rocket', 'api')).toMatchObject({ kind: 'icon', label: 'Deploy' })
  })

  it('falls back to letters for empty or unknown icons', () => {
    expect(markOf('', 'api-prod')).toEqual({ kind: 'letters', text: 'AP' })
    expect(markOf('unknown', 'nas')).toEqual({ kind: 'letters', text: 'NA' })
  })
})

describe('custom letters', () => {
  it('round-trips through the stored icon value', () => {
    expect(lettersIcon('π')).toBe('letters:π')
    expect(customLetters('letters:π')).toBe('π')
    expect(markOf('letters:π', 'pi-home')).toEqual({ kind: 'letters', text: 'π' })
  })

  it('keeps two graphemes and drops whitespace', () => {
    expect(lettersIcon(' a b c ')).toBe('letters:ab')
    expect(lettersIcon('👍🏽x')).toBe('letters:👍🏽x')
    expect(lettersIcon('🇺🇿🇺🇿🇺🇿')).toBe('letters:🇺🇿🇺🇿')
  })

  it('treats empty letters as no custom letters', () => {
    expect(lettersIcon('   ')).toBe('')
    expect(customLetters('letters:')).toBeNull()
    expect(customLetters('rocket')).toBeNull()
  })
})
