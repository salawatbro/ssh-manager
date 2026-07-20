import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from './toasts'

// The store is a module singleton — start every test from an empty stack.
beforeEach(() => {
  vi.useFakeTimers()
  useToasts.setState({ toasts: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('toasts store', () => {
  it('pushes newest last and auto-dismisses success after 4s', () => {
    useToasts.getState().push('success', 'Backup written.')
    expect(useToasts.getState().toasts).toMatchObject([{ kind: 'success', message: 'Backup written.' }])
    vi.advanceTimersByTime(3999)
    expect(useToasts.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(useToasts.getState().toasts).toHaveLength(0)
  })

  it('keeps errors for 8s', () => {
    useToasts.getState().push('error', 'boom')
    vi.advanceTimersByTime(4000)
    expect(useToasts.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(useToasts.getState().toasts).toHaveLength(0)
  })

  it('caps the stack at 4, dropping the oldest first', () => {
    for (let n = 1; n <= 5; n++) useToasts.getState().push('info', `t${n}`)
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['t2', 't3', 't4', 't5'])
  })

  it('dismiss removes one toast; a dropped toast expiring later is a no-op', () => {
    for (let n = 1; n <= 5; n++) useToasts.getState().push('info', `t${n}`)
    const [first] = useToasts.getState().toasts
    useToasts.getState().dismiss(first.id)
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['t3', 't4', 't5'])
    // t1 was capped out, t2 dismissed — their timers must not break anything.
    vi.advanceTimersByTime(4000)
    expect(useToasts.getState().toasts).toHaveLength(0)
  })
})
