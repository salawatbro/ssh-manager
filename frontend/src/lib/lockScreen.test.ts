import { describe, expect, it } from 'vitest'
import { clock, lockedLine, tunnelsLine } from './lockScreen'

const at1432 = new Date(2026, 10, 6, 14, 32).getTime()

describe('lockedLine', () => {
  it('says why and when', () => {
    expect(clock(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05')
    expect(lockedLine('idle', at1432, 10)).toBe('Locked after 10 minutes idle · 14:32')
    expect(lockedLine('idle', at1432, 1)).toBe('Locked after 1 minute idle · 14:32')
    expect(lockedLine('sleep', at1432, 10)).toBe('Locked when the Mac slept or its screen locked · 14:32')
    expect(lockedLine('manual', at1432, 10)).toBe('Locked · 14:32')
    expect(lockedLine('manual', 0, 10)).toBe('Locked')
    expect(lockedLine('launch', at1432, 10)).toBe('Unlock to reach your servers, keys and tunnels.')
    expect(lockedLine('', 0, 10)).toBe('')
  })
})

describe('tunnelsLine', () => {
  it('counts what keeps running, or says they stop', () => {
    expect(tunnelsLine(2, true)).toBe('2 tunnels keep running')
    expect(tunnelsLine(1, true)).toBe('1 tunnel keeps running')
    expect(tunnelsLine(0, true)).toBe('No tunnels running')
    expect(tunnelsLine(3, false)).toBe('Tunnels stop while locked')
  })
})
