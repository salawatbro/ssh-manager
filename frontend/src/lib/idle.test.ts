import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleTimer } from './idle'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createIdleTimer', () => {
  it('fires onIdle after the timeout with no activity', () => {
    const onIdle = vi.fn()
    const t = createIdleTimer({ timeoutMs: 1000, onIdle })
    t.notifyActivity()
    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
    t.stop()
  })

  it('activity resets the countdown', () => {
    const onIdle = vi.fn()
    const t = createIdleTimer({ timeoutMs: 1000, onIdle })
    t.notifyActivity()
    vi.advanceTimersByTime(900)
    t.notifyActivity()
    vi.advanceTimersByTime(900)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(onIdle).toHaveBeenCalledTimes(1)
    t.stop()
  })

  it('stop cancels a pending fire', () => {
    const onIdle = vi.fn()
    const t = createIdleTimer({ timeoutMs: 1000, onIdle })
    t.notifyActivity()
    t.stop()
    vi.advanceTimersByTime(2000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
