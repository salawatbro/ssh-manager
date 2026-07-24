import { describe, it, expect, beforeEach } from 'vitest'
import { useSessions } from './sessions'

describe('paneShell', () => {
  beforeEach(() => {
    useSessions.setState({ paneShell: {} })
  })

  it('records a pane shell and whether integration was injected', () => {
    useSessions.getState().setPaneShell('p1', { shell: 'zsh', integration: true })
    expect(useSessions.getState().paneShell.p1).toEqual({ shell: 'zsh', integration: true })
  })

  it('records an unsupported shell as detected-but-not-integrated', () => {
    useSessions.getState().setPaneShell('p1', { shell: 'csh', integration: false })
    expect(useSessions.getState().paneShell.p1).toEqual({ shell: 'csh', integration: false })
  })

  it('clears one pane and leaves the record identical when the key is absent', () => {
    useSessions.getState().setPaneShell('p1', { shell: 'bash', integration: true })
    const before = useSessions.getState().paneShell
    useSessions.getState().clearPaneShell('missing')
    expect(useSessions.getState().paneShell).toBe(before) // same reference
    useSessions.getState().clearPaneShell('p1')
    expect(useSessions.getState().paneShell.p1).toBeUndefined()
  })
})
