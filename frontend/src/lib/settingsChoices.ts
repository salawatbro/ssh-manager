import type { Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'

export interface Choice<T> {
  value: T
  label: string
}

// withCurrent keeps a stored value that is not one of the presets (an older
// stepper allowed any number) selectable instead of showing a blank.
function withCurrent(choices: Choice<number>[], current: number, label: (n: number) => string): Choice<number>[] {
  if (choices.some((c) => c.value === current)) return choices
  return [...choices, { value: current, label: label(current) }].sort((a, b) => a.value - b.value)
}

const minutes = (n: number) => (n === 1 ? 'After 1 minute' : `After ${n} minutes`)
const seconds = (n: number) => `${n} seconds`

// 0 = the idle lock is off.
export function idleChoices(current: number): Choice<number>[] {
  const presets = [1, 5, 10, 15, 30, 60].map((n) => ({ value: n, label: minutes(n) }))
  return [{ value: 0, label: 'Never' }, ...withCurrent(presets, current, minutes).filter((c) => c.value !== 0)]
}

export function idleValue(s: Pick<Settings, 'lockIdleEnabled' | 'lockIdleMinutes'>): number {
  return s.lockIdleEnabled ? s.lockIdleMinutes : 0
}

export function idlePatch(v: number): Partial<Settings> {
  return v === 0 ? { lockIdleEnabled: false } : { lockIdleEnabled: true, lockIdleMinutes: v }
}

export function timeoutChoices(current: number): Choice<number>[] {
  return withCurrent(
    [5, 10, 15, 30, 60].map((n) => ({ value: n, label: seconds(n) })),
    current,
    seconds,
  )
}
