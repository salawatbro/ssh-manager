import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const launcher = vi.hoisted(() => ({ Open: vi.fn() }))
vi.mock('@bindings/github.com/salawat/sshmgr/internal/service', () => ({
  LauncherService: launcher,
  LockService: {},
  ServerService: { List: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@bindings/github.com/salawat/sshmgr', () => ({ BiometricService: {} }))

import { useLock } from '../stores/lock'
import { useToasts } from '../stores/toasts'
import { launch } from './launch'

beforeEach(() => {
  vi.useFakeTimers()
  launcher.Open.mockReset()
  useToasts.setState({ toasts: [] })
  useLock.setState({ locked: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('launch', () => {
  it('opens the server and stays quiet on a plain success', async () => {
    launcher.Open.mockResolvedValue({ note: '' })
    await launch('srv-1')
    expect(launcher.Open).toHaveBeenCalledWith('srv-1')
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('shows a fallback note as info', async () => {
    launcher.Open.mockResolvedValue({ note: 'iTerm2 isn’t installed — opened in Terminal.' })
    await launch('srv-1')
    expect(useToasts.getState().toasts).toMatchObject([{ kind: 'info', message: 'iTerm2 isn’t installed — opened in Terminal.' }])
  })

  it('shows a launch error as an error toast', async () => {
    const err = Object.assign(new Error('x'), { cause: { code: 'ERR_AUTOMATION_DENIED' } })
    launcher.Open.mockRejectedValue(err)
    await launch('srv-1')
    expect(useToasts.getState().toasts).toMatchObject([{ kind: 'error', message: expect.stringMatching(/Automation/) }])
  })

  it('does nothing while the app is locked', async () => {
    useLock.setState({ locked: true })
    await launch('srv-1')
    expect(launcher.Open).not.toHaveBeenCalled()
  })
})
