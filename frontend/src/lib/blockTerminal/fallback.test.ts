import { describe, expect, it } from 'vitest'
import { shouldFallbackToClassic } from './fallback'

describe('shouldFallbackToClassic', () => {
  it('falls back only after a connected shell is known unsupported', () => {
    expect(shouldFallbackToClassic('connected', false)).toBe(true)
    expect(shouldFallbackToClassic('connecting', false)).toBe(false)
    expect(shouldFallbackToClassic('connected', null)).toBe(false)
    expect(shouldFallbackToClassic('connected', true)).toBe(false)
  })
})
