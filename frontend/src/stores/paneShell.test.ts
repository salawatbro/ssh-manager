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

// clearPaneConnection is the single action useTerminalSession's cleanup calls
// on teardown — it must drop BOTH the session id and the shell info for the
// pane, not just one of the two (a dangling paneShell entry would make the
// status bar keep reporting a shell for a pane that no longer has a session).
describe('clearPaneConnection', () => {
  beforeEach(() => {
    useSessions.setState({ paneSession: {}, paneShell: {} })
  })

  it('clears both the session id and the shell info for the pane', () => {
    useSessions.getState().setPaneSession('p1', 'sess-1')
    useSessions.getState().setPaneShell('p1', { shell: 'bash', integration: true })
    useSessions.getState().clearPaneConnection('p1')
    expect(useSessions.getState().paneSession.p1).toBeUndefined()
    expect(useSessions.getState().paneShell.p1).toBeUndefined()
  })

  it('leaves other panes untouched', () => {
    useSessions.getState().setPaneSession('p1', 'sess-1')
    useSessions.getState().setPaneShell('p1', { shell: 'bash', integration: true })
    useSessions.getState().setPaneSession('p2', 'sess-2')
    useSessions.getState().setPaneShell('p2', { shell: 'zsh', integration: true })
    useSessions.getState().clearPaneConnection('p1')
    expect(useSessions.getState().paneSession.p2).toBe('sess-2')
    expect(useSessions.getState().paneShell.p2).toEqual({ shell: 'zsh', integration: true })
  })
})
