import { describe, expect, it } from 'vitest'
import { PIN_LENGTH, isComplete, sanitizePin } from './pinEntry'

describe('sanitizePin', () => {
  it('keeps only digits', () => {
    expect(sanitizePin('12a3b4')).toBe('1234')
  })
  it('caps at six digits', () => {
    expect(sanitizePin('1234567890')).toBe('123456')
  })
  it('drops spaces and symbols', () => {
    expect(sanitizePin(' 1 2-3 ')).toBe('123')
  })
})

describe('isComplete', () => {
  it('is true at exactly six digits', () => {
    expect(isComplete('123456')).toBe(true)
  })
  it('is false below six', () => {
    expect(isComplete('12345')).toBe(false)
  })
})

it('exposes the length constant', () => {
  expect(PIN_LENGTH).toBe(6)
})
