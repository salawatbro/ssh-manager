import { describe, expect, it } from 'vitest'
import goLook from '../../../internal/domain/look.go?raw'
import { ICONS, TINTS } from './look'

// The backend validates icon and colour against its own copy of these lists.
function goList(name: string): string[] {
  const m = goLook.match(new RegExp(`var ${name} = \\[\\]string\\{([^}]*)\\}`))
  if (!m) throw new Error(`internal/domain/look.go: ${name} not found`)
  return Array.from(m[1].matchAll(/"([^"]+)"/g), (x) => x[1])
}

describe('look lists match the backend', () => {
  it('icon ids', () => {
    expect(goList('IconIDs')).toEqual(ICONS.map((i) => i.id))
  })

  it('tint names', () => {
    expect(goList('TintNames')).toEqual([...TINTS])
  })
})
