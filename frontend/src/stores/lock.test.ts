import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@bindings/github.com/salawat/sshmgr/internal/service', () => ({
  LockService: { HasPin: vi.fn().mockResolvedValue(true) },
}))
vi.mock('@bindings/github.com/salawat/sshmgr', () => ({
  BiometricService: { Available: vi.fn().mockResolvedValue(false) },
}))

import { useLock } from './lock'

beforeEach(() => {
  useLock.setState({ locked: false, hasPin: false, biometricsAvailable: false })
})

describe('useLock', () => {
  it('refresh reads HasPin and Available', async () => {
    await useLock.getState().refresh()
    expect(useLock.getState().hasPin).toBe(true)
    expect(useLock.getState().biometricsAvailable).toBe(false)
  })

  it('lock only engages when a PIN exists', () => {
    useLock.setState({ hasPin: false })
    useLock.getState().lock()
    expect(useLock.getState().locked).toBe(false)
    useLock.setState({ hasPin: true })
    useLock.getState().lock()
    expect(useLock.getState().locked).toBe(true)
  })

  it('unlock clears the locked flag', () => {
    useLock.setState({ locked: true })
    useLock.getState().unlock()
    expect(useLock.getState().locked).toBe(false)
  })
})
