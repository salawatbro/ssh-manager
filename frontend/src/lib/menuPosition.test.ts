import { describe, expect, it } from 'vitest'
import { placeMenu } from './menuPosition'

describe('placeMenu', () => {
  const vw = 1000
  const vh = 800

  it('opens at the click', () => {
    expect(placeMenu(100, 200, 240, 300, vw, vh)).toEqual({ left: 100, top: 200 })
  })

  it('puts the right edge at x when aligned to the end', () => {
    expect(placeMenu(600, 200, 240, 300, vw, vh, 'end')).toEqual({ left: 360, top: 200 })
  })

  it('keeps the menu inside the right and bottom edges', () => {
    expect(placeMenu(900, 700, 240, 300, vw, vh)).toEqual({ left: 756, top: 496 })
  })

  it('keeps an end-aligned menu inside the left edge', () => {
    expect(placeMenu(100, 10, 240, 300, vw, vh, 'end')).toEqual({ left: 4, top: 10 })
  })

  it('pins a menu taller than the window to the top', () => {
    expect(placeMenu(10, 50, 240, 900, vw, vh).top).toBe(4)
  })
})
