import { beforeEach, describe, expect, it, vi } from 'vitest'

const svc = vi.hoisted(() => ({
  HasPin: vi.fn().mockResolvedValue(true),
  Lock: vi.fn().mockResolvedValue(undefined),
  Status: vi.fn().mockResolvedValue({ locked: true, reason: 'sleep', since: 1700000000000 }),
  UnlockWithBiometrics: vi.fn().mockResolvedValue(true),
}))

vi.mock('@bindings/github.com/salawat/sshmgr/internal/service', () => ({ LockService: svc }))
vi.mock('@bindings/github.com/salawat/sshmgr', () => ({
  BiometricService: { Available: vi.fn().mockResolvedValue(false) },
}))

import { useLock } from './lock'

beforeEach(() => {
  vi.clearAllMocks()
  useLock.setState({ locked: false, hasPin: false, biometricsAvailable: false, reason: '', since: 0 })
})

describe('useLock', () => {
  it('refresh reads HasPin and Available', async () => {
    await useLock.getState().refresh()
    expect(useLock.getState().hasPin).toBe(true)
    expect(useLock.getState().biometricsAvailable).toBe(false)
  })

  it('lock only engages when a PIN exists, and locks the backend too', () => {
    useLock.setState({ hasPin: false })
    useLock.getState().lock('manual')
    expect(useLock.getState().locked).toBe(false)
    expect(svc.Lock).not.toHaveBeenCalled()
    useLock.setState({ hasPin: true })
    useLock.getState().lock('idle')
    expect(useLock.getState()).toMatchObject({ locked: true, reason: 'idle' })
    expect(useLock.getState().since).toBeGreaterThan(0)
    expect(svc.Lock).toHaveBeenCalledWith('idle')
  })

  it('reads the reason of a lock it did not start', async () => {
    useLock.getState().setLocked(true)
    expect(useLock.getState().locked).toBe(true)
    await vi.waitFor(() => expect(useLock.getState().reason).toBe('sleep'))
    expect(useLock.getState().since).toBe(1700000000000)
    useLock.getState().setLocked(false)
    expect(useLock.getState()).toMatchObject({ locked: false, reason: '', since: 0 })
  })

  it('unlock clears the locked flag', () => {
    useLock.setState({ locked: true })
    useLock.getState().unlock()
    expect(useLock.getState().locked).toBe(false)
  })

  it('unlockWithBiometrics goes through the backend gate', async () => {
    useLock.setState({ locked: true })
    svc.UnlockWithBiometrics.mockResolvedValueOnce(false)
    expect(await useLock.getState().unlockWithBiometrics('Unlock Zish')).toBe(false)
    expect(useLock.getState().locked).toBe(true)
    expect(await useLock.getState().unlockWithBiometrics('Unlock Zish')).toBe(true)
    expect(useLock.getState().locked).toBe(false)
    expect(svc.UnlockWithBiometrics).toHaveBeenCalledWith('Unlock Zish')
  })
})
