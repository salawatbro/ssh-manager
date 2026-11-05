import { describe, expect, it } from 'vitest'
import { idleChoices, idlePatch, idleValue, timeoutChoices } from './settingsChoices'

describe('idle lock choices', () => {
  it('maps the two stored fields onto one select', () => {
    expect(idleValue({ lockIdleEnabled: false, lockIdleMinutes: 10 })).toBe(0)
    expect(idleValue({ lockIdleEnabled: true, lockIdleMinutes: 15 })).toBe(15)
    expect(idlePatch(0)).toEqual({ lockIdleEnabled: false })
    expect(idlePatch(30)).toEqual({ lockIdleEnabled: true, lockIdleMinutes: 30 })
  })

  it('keeps a custom stored value selectable, in order', () => {
    expect(idleChoices(10).map((c) => c.value)).toEqual([0, 1, 5, 10, 15, 30, 60])
    const custom = idleChoices(7)
    expect(custom.map((c) => c.value)).toEqual([0, 1, 5, 7, 10, 15, 30, 60])
    expect(custom.find((c) => c.value === 7)?.label).toBe('After 7 minutes')
    expect(idleChoices(0)[0].label).toBe('Never')
  })

  it('does the same for the connection timeout', () => {
    expect(timeoutChoices(10).map((c) => c.value)).toEqual([5, 10, 15, 30, 60])
    expect(timeoutChoices(45).map((c) => c.value)).toEqual([5, 10, 15, 30, 45, 60])
  })
})
